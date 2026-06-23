import { PrismaClient } from '../../lib/prisma/generated/client.js'
import { BadRequestError, NotFoundError, ForbiddenError } from '../../shared/errors/app-error.js'
import type { CreateSwapBody, SwapResponse } from './swap.schema.js'

export class SwapService {
  constructor(private db: PrismaClient) {}

  // membro abre pedido de troca sem alvo — vai pra fila aberta do grupo
  async createSwap(
    orgId: string,
    requesterMemberId: string,
    requesterSlotId: string,
    data: CreateSwapBody
  ): Promise<SwapResponse> {
    const requesterSlot = await this.db.scheduleSlot.findFirst({
      where: { id: requesterSlotId, member_id: requesterMemberId, event: { organization_id: orgId } },
    })
    if (!requesterSlot) throw new NotFoundError('Slot')

    // não permite dois pedidos abertos pro mesmo slot
    const existing = await this.db.swapRequest.findFirst({
      where: {
        requester_slot_id: requesterSlotId,
        status: { in: ['PENDING_OPEN', 'PENDING_LEADER'] },
      },
    })
    if (existing) throw new BadRequestError('Já existe uma troca pendente para este slot')

    const swap = await this.db.swapRequest.create({
      data: {
        organization_id: orgId,
        requester_slot_id: requesterSlotId,
        requester_id: requesterMemberId,
        // target_slot_id e target_id ficam null até alguém aceitar
        message: data.message,
        status: 'PENDING_OPEN',
      },
      include: this.swapInclude(),
    })

    return this.toResponse(swap)
  }

  // qualquer membro do grupo aceita a troca
  async volunteerForSwap(
    swapId: string,
    volunteerMemberId: string,
    volunteerSlotId: string,
    orgId: string
  ): Promise<SwapResponse> {
    const swap = await this.findSwapInOrg(swapId, orgId)

    if (swap.status !== 'PENDING_OPEN') {
      throw new BadRequestError('Esta troca não está mais disponível')
    }

    if (swap.requester_id === volunteerMemberId) {
      throw new BadRequestError('Você não pode aceitar sua própria troca')
    }

    // valida que o slot do voluntário pertence ao mesmo evento
    const volunteerSlot = await this.db.scheduleSlot.findFirst({
      where: {
        id: volunteerSlotId,
        member_id: volunteerMemberId,
        event_id: (await this.db.scheduleSlot.findUniqueOrThrow({
          where: { id: swap.requester_slot_id },
          select: { event_id: true },
        })).event_id,
      },
    })
    if (!volunteerSlot) throw new NotFoundError('Volunteer slot')

    const updated = await this.db.swapRequest.update({
      where: { id: swapId },
      data: {
        target_id: volunteerMemberId,
        target_slot_id: volunteerSlotId,
        status: 'PENDING_LEADER',
      },
      include: this.swapInclude(),
    })

    return this.toResponse(updated)
  }

  // voluntário rejeita (desiste depois de aceitar, antes do líder aprovar)
  async volunteerReject(
    swapId: string,
    volunteerMemberId: string,
    orgId: string,
    rejectionReason?: string
  ): Promise<SwapResponse> {
    const swap = await this.findSwapInOrg(swapId, orgId)

    if (swap.target_id !== volunteerMemberId) {
      throw new ForbiddenError('Apenas quem aceitou pode desistir da troca')
    }

    if (swap.status !== 'PENDING_LEADER') {
      throw new BadRequestError('Esta troca não está no estado correto')
    }

    // volta pra fila aberta — outros podem aceitar
    const updated = await this.db.swapRequest.update({
      where: { id: swapId },
      data: {
        target_id: null,
        target_slot_id: null,
        status: 'PENDING_OPEN',
        rejection_reason: rejectionReason ?? null,
      },
      include: this.swapInclude(),
    })

    return this.toResponse(updated)
  }

  // solicitante cancela o pedido
  async cancelSwap(
    swapId: string,
    requesterMemberId: string,
    orgId: string
  ): Promise<SwapResponse> {
    const swap = await this.findSwapInOrg(swapId, orgId)

    if (swap.requester_id !== requesterMemberId) {
      throw new ForbiddenError('Apenas o solicitante pode cancelar a troca')
    }

    if (!['PENDING_OPEN', 'PENDING_LEADER'].includes(swap.status)) {
      throw new BadRequestError('Não é possível cancelar uma troca já resolvida')
    }

    const updated = await this.db.swapRequest.update({
      where: { id: swapId },
      data: { status: 'CANCELLED', resolved_at: new Date() },
      include: this.swapInclude(),
    })

    return this.toResponse(updated)
  }

  // líder aprova ou rejeita
  async reviewByLeader(
    swapId: string,
    reviewerUserId: string,
    orgId: string,
    action: 'APPROVE' | 'REJECT',
    rejectionReason?: string
  ): Promise<SwapResponse> {
    const swap = await this.findSwapInOrg(swapId, orgId)

    if (swap.status !== 'PENDING_LEADER') {
      throw new BadRequestError('Esta troca não está aguardando aprovação do líder')
    }

    if (action === 'REJECT') {
      // rejeição do líder → volta pra fila aberta
      const updated = await this.db.swapRequest.update({
        where: { id: swapId },
        data: {
          status: 'PENDING_OPEN',
          reviewed_by: reviewerUserId,
          rejection_reason: rejectionReason ?? null,
          target_id: null,
          target_slot_id: null,
        },
        include: this.swapInclude(),
      })
      return this.toResponse(updated)
    }

    // APPROVE — troca as role_labels entre os dois slots
    if (!swap.target_slot_id) throw new BadRequestError('Troca sem voluntário definido')

    const [reqSlot, tgtSlot] = await Promise.all([
      this.db.scheduleSlot.findUniqueOrThrow({ where: { id: swap.requester_slot_id } }),
      this.db.scheduleSlot.findUniqueOrThrow({ where: { id: swap.target_slot_id } }),
    ])

    await this.db.$transaction([
      this.db.scheduleSlot.update({
        where: { id: swap.requester_slot_id },
        data: { role_labels: tgtSlot.role_labels },
      }),
      this.db.scheduleSlot.update({
        where: { id: swap.target_slot_id },
        data: { role_labels: reqSlot.role_labels },
      }),
      this.db.attendance.updateMany({
        where: { slot_id: { in: [swap.requester_slot_id, swap.target_slot_id] } },
        data: { status: 'SWAPPED', responded_at: new Date() },
      }),
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

  // lista todas as trocas abertas da org — qualquer membro pode ver e aceitar
  async listOpenSwaps(orgId: string, memberId: string): Promise<SwapResponse[]> {
    const swaps = await this.db.swapRequest.findMany({
      where: {
        organization_id: orgId,
        status: 'PENDING_OPEN',
        // não mostra as próprias trocas abertas — o membro já vê nas "minhas trocas"
        requester_id: { not: memberId },
      },
      orderBy: { created_at: 'asc' },
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
        role_labels: swap.requester_slot.role_labels,
        member: {
          id: swap.requester_slot.member.id,
          user: swap.requester_slot.member.user,
        },
      },
      volunteer: swap.target_slot
        ? {
            id: swap.target_slot.id,
            role_labels: swap.target_slot.role_labels,
            member: {
              id: swap.target_slot.member.id,
              user: swap.target_slot.member.user,
            },
          }
        : null,
    }
  }
}