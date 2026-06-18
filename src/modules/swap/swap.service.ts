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

    // aprovado — troca os member_id nos slots
    // problema: unique(event_id, member_id) é validado a cada UPDATE, não no commit
    // solução: deleta os dois slots e recria com os member_id invertidos,
    // preservando o id original via transação atômica
    await this.db.$transaction(async (tx) => {
      const [reqSlot, tgtSlot] = await Promise.all([
        tx.scheduleSlot.findUniqueOrThrow({ where: { id: swap.requester_slot_id } }),
        tx.scheduleSlot.findUniqueOrThrow({ where: { id: swap.target_slot_id } }),
      ])

      // remove os dois slots (cascata apaga as attendances junto)
      await tx.scheduleSlot.deleteMany({
        where: { id: { in: [reqSlot.id, tgtSlot.id] } },
      })

      // recria com member_id invertido, mantendo o mesmo id e role_label
      const newReqSlot = await tx.scheduleSlot.create({
        data: {
          id: reqSlot.id,
          event_id: reqSlot.event_id,
          member_id: tgtSlot.member_id,
          role_label: reqSlot.role_label,
          notes: reqSlot.notes,
        },
      })
      const newTgtSlot = await tx.scheduleSlot.create({
        data: {
          id: tgtSlot.id,
          event_id: tgtSlot.event_id,
          member_id: reqSlot.member_id,
          role_label: tgtSlot.role_label,
          notes: tgtSlot.notes,
        },
      })

      // recria as attendances como SWAPPED pros novos donos do slot
      await tx.attendance.create({
        data: { slot_id: newReqSlot.id, member_id: newReqSlot.member_id, status: 'SWAPPED', responded_at: new Date() },
      })
      await tx.attendance.create({
        data: { slot_id: newTgtSlot.id, member_id: newTgtSlot.member_id, status: 'SWAPPED', responded_at: new Date() },
      })

      await tx.swapRequest.update({
        where: { id: swapId },
        data: { status: 'APPROVED', reviewed_by: reviewerUserId, resolved_at: new Date() },
      })
    })

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