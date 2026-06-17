import { PrismaClient } from '../../lib/prisma/generated/client.js'
import { BadRequestError, NotFoundError, ForbiddenError } from '../../shared/errors/app-error.js'
import type { CreateSwapBody, ReviewSwapBody, SwapResponse } from './swap.schema.js'

export class SwapService {
  constructor(private db: PrismaClient) {}

  async createSwap(
    orgId: string,
    requesterMemberId: string,
    requesterSlotId: string,
    data: CreateSwapBody
  ): Promise<SwapResponse> {
    // valida slot do solicitante
    const requesterSlot = await this.db.scheduleSlot.findFirst({
      where: { id: requesterSlotId, member_id: requesterMemberId, event: { organization_id: orgId } },
    })
    if (!requesterSlot) throw new NotFoundError('Slot')

    // valida slot do target
    const targetSlot = await this.db.scheduleSlot.findFirst({
      where: { id: data.target_slot_id, event: { organization_id: orgId } },
      include: { member: true },
    })
    if (!targetSlot) throw new NotFoundError('Target slot')

    if (targetSlot.member_id === requesterMemberId) {
      throw new BadRequestError('Você não pode trocar consigo mesmo')
    }

    // não permite troca duplicada pendente
    const existing = await this.db.swapRequest.findFirst({
      where: {
        requester_slot_id: requesterSlotId,
        status: { in: ['PENDING_TARGET', 'PENDING_LEADER'] },
      },
    })
    if (existing) throw new BadRequestError('Já existe uma troca pendente para este slot')

    const swap = await this.db.swapRequest.create({
      data: {
        organization_id: orgId,
        requester_slot_id: requesterSlotId,
        target_slot_id: data.target_slot_id,
        requester_id: requesterMemberId,
        target_id: targetSlot.member_id,
        message: data.message,
        status: 'PENDING_TARGET',
      },
      include: this.swapInclude(),
    })

    return this.toResponse(swap)
  }

  // target aceita ou recusa
  async reviewByTarget(
    swapId: string,
    targetMemberId: string,
    orgId: string,
    data: ReviewSwapBody
  ): Promise<SwapResponse> {
    const swap = await this.findSwapInOrg(swapId, orgId)

    if (swap.target_id !== targetMemberId) {
      throw new ForbiddenError('Apenas o membro alvo pode responder esta troca')
    }

    if (swap.status !== 'PENDING_TARGET') {
      throw new BadRequestError('Esta troca não está aguardando sua resposta')
    }

    if (data.action === 'REJECT') {
      const updated = await this.db.swapRequest.update({
        where: { id: swapId },
        data: {
          status: 'REJECTED_TARGET',
          rejection_reason: data.rejection_reason,
          resolved_at: new Date(),
        },
        include: this.swapInclude(),
      })
      return this.toResponse(updated)
    }

    // aceito pelo target → vai pro líder
    const updated = await this.db.swapRequest.update({
      where: { id: swapId },
      data: { status: 'PENDING_LEADER' },
      include: this.swapInclude(),
    })

    return this.toResponse(updated)
  }

  // líder aprova ou recusa
  async reviewByLeader(
    swapId: string,
    reviewerUserId: string,
    orgId: string,
    data: ReviewSwapBody
  ): Promise<SwapResponse> {
    const swap = await this.findSwapInOrg(swapId, orgId)

    if (swap.status !== 'PENDING_LEADER') {
      throw new BadRequestError('Esta troca não está aguardando aprovação do líder')
    }

    if (data.action === 'REJECT') {
      const updated = await this.db.swapRequest.update({
        where: { id: swapId },
        data: {
          status: 'REJECTED_LEADER',
          reviewed_by: reviewerUserId,
          rejection_reason: data.rejection_reason,
          resolved_at: new Date(),
        },
        include: this.swapInclude(),
      })
      return this.toResponse(updated)
    }

    // aprovado — troca os member_id nos slots e atualiza attendances
    await this.db.$transaction([
      // troca os membros nos slots
      this.db.scheduleSlot.update({
        where: { id: swap.requester_slot_id },
        data: { member_id: swap.target_id! },
      }),
      this.db.scheduleSlot.update({
        where: { id: swap.target_slot_id },
        data: { member_id: swap.requester_id },
      }),
      // marca attendances como SWAPPED
      this.db.attendance.updateMany({
        where: { slot_id: { in: [swap.requester_slot_id, swap.target_slot_id] } },
        data: { status: 'SWAPPED', responded_at: new Date() },
      }),
      // finaliza o swap
      this.db.swapRequest.update({
        where: { id: swapId },
        data: {
          status: 'APPROVED',
          reviewed_by: reviewerUserId,
          resolved_at: new Date(),
        },
      }),
    ])

    const updated = await this.db.swapRequest.findUniqueOrThrow({
      where: { id: swapId },
      include: this.swapInclude(),
    })

    return this.toResponse(updated)
  }

  async listSwaps(orgId: string, memberId: string): Promise<SwapResponse[]> {
    const swaps = await this.db.swapRequest.findMany({
      where: {
        organization_id: orgId,
        OR: [{ requester_id: memberId }, { target_id: memberId }],
      },
      orderBy: { created_at: 'desc' },
      include: this.swapInclude(),
    })

    return swaps.map((s) => this.toResponse(s))
  }

  async listPendingForLeader(orgId: string): Promise<SwapResponse[]> {
    const swaps = await this.db.swapRequest.findMany({
      where: { organization_id: orgId, status: 'PENDING_LEADER' },
      orderBy: { created_at: 'asc' },
      include: this.swapInclude(),
    })

    return swaps.map((s) => this.toResponse(s))
  }

  // ── helpers privados

  private async findSwapInOrg(swapId: string, orgId: string) {
    const swap = await this.db.swapRequest.findFirst({
      where: { id: swapId, organization_id: orgId },
    })
    if (!swap) throw new NotFoundError('Swap request')
    return swap
  }

  private swapInclude() {
    return {
      requester_slot: {
        include: {
          member: {
            include: { user: { select: { name: true, avatar_url: true } } },
          },
        },
      },
      target_slot: {
        include: {
          member: {
            include: { user: { select: { name: true, avatar_url: true } } },
          },
        },
      },
    } as const
  }

  private toResponse(swap: any): SwapResponse {
    return {
      id: swap.id,
      status: swap.status,
      message: swap.message,
      rejection_reason: swap.rejection_reason,
      created_at: swap.created_at,
      resolved_at: swap.resolved_at,
      requester: {
        id: swap.requester_slot.id,
        role_label: swap.requester_slot.role_label,
        member: {
          id: swap.requester_slot.member.id,
          user: swap.requester_slot.member.user,
        },
      },
      target: swap.target_slot
        ? {
            id: swap.target_slot.id,
            role_label: swap.target_slot.role_label,
            member: {
              id: swap.target_slot.member.id,
              user: swap.target_slot.member.user,
            },
          }
        : null,
    }
  }
}