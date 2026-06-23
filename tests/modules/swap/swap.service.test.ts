import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../../src/lib/prisma.js'
import { SwapService } from '../../../src/modules/swap/swap.service.js'
import { BadRequestError, ForbiddenError } from '../../../src/shared/errors/app-error.js'

const swapService = new SwapService(prisma)

async function setup() {
  const leader = await prisma.user.create({
    data: { name: 'Leader', email: `leader${Date.now()}@pulso.app`, google_id: `gl${Date.now()}` },
  })
  const member1 = await prisma.user.create({
    data: { name: 'Member1', email: `m1${Date.now()}@pulso.app`, google_id: `gm1${Date.now()}` },
  })
  const member2 = await prisma.user.create({
    data: { name: 'Member2', email: `m2${Date.now()}@pulso.app`, google_id: `gm2${Date.now()}` },
  })

  const org = await prisma.organization.create({
    data: {
      name: 'Swap Org',
      slug: `swap-org-${Date.now()}`,
      created_by: leader.id,
      confirmation_deadline_hours: 48,
    },
  })

  const [orgLeader, orgMember1, orgMember2] = await Promise.all([
    prisma.organizationMember.create({ data: { user_id: leader.id, organization_id: org.id, role: 'LEADER' } }),
    prisma.organizationMember.create({ data: { user_id: member1.id, organization_id: org.id, role: 'MEMBER' } }),
    prisma.organizationMember.create({ data: { user_id: member2.id, organization_id: org.id, role: 'MEMBER' } }),
  ])

  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const event = await prisma.event.create({
    data: {
      organization_id: org.id,
      created_by: leader.id,
      title: 'Culto',
      starts_at: startsAt,
      confirmation_deadline: new Date(startsAt.getTime() - 48 * 60 * 60 * 1000),
      is_published: true,
    },
  })

  const [slot1, slot2] = await Promise.all([
    prisma.scheduleSlot.create({ data: { event_id: event.id, member_id: orgMember1.id, role_labels: ['Violão'] } }),
    prisma.scheduleSlot.create({ data: { event_id: event.id, member_id: orgMember2.id, role_labels: ['Baixo'] } }),
  ])

  return { org, leader, member1, member2, orgLeader, orgMember1, orgMember2, event, slot1, slot2 }
}

const CLEANUP_ORDER = async () => {
  await prisma.memberStats.deleteMany()
  await prisma.techCheckAssignment.deleteMany()
  await prisma.techCheckItem.deleteMany()
  await prisma.eventSong.deleteMany()
  await prisma.song.deleteMany()
  await prisma.swapRequest.deleteMany()
  await prisma.attendance.deleteMany()
  await prisma.scheduleSlot.deleteMany()
  await prisma.event.deleteMany()
  await prisma.inviteLink.deleteMany()
  await prisma.organizationMember.deleteMany()
  await prisma.organization.deleteMany()
  await prisma.user.deleteMany()
}

describe('SwapService', () => {
  beforeEach(CLEANUP_ORDER)

  describe('createSwap', () => {
    it('deve criar swap PENDING_OPEN sem alvo definido', async () => {
      const { org, orgMember1, slot1 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {
        message: 'Alguém pode me cobrir?',
      })

      expect(swap.status).toBe('PENDING_OPEN')
      expect(swap.volunteer).toBeNull()
    })

    it('não deve permitir dois pedidos abertos pro mesmo slot', async () => {
      const { org, orgMember1, slot1 } = await setup()

      await swapService.createSwap(org.id, orgMember1.id, slot1.id, {})

      await expect(
        swapService.createSwap(org.id, orgMember1.id, slot1.id, {})
      ).rejects.toThrow(BadRequestError)
    })
  })

  describe('volunteerForSwap', () => {
    it('deve mover pra PENDING_LEADER quando alguém aceita', async () => {
      const { org, orgMember1, orgMember2, slot1, slot2 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {})
      const accepted = await swapService.volunteerForSwap(swap.id, orgMember2.id, slot2.id, org.id)

      expect(accepted.status).toBe('PENDING_LEADER')
      expect(accepted.volunteer?.member.id).toBe(orgMember2.id)
    })

    it('não deve permitir o solicitante aceitar a própria troca', async () => {
      const { org, orgMember1, slot1 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {})

      await expect(
        swapService.volunteerForSwap(swap.id, orgMember1.id, slot1.id, org.id)
      ).rejects.toThrow(BadRequestError)
    })

    it('não deve permitir aceitar troca que não está PENDING_OPEN', async () => {
      const { org, orgMember1, orgMember2, slot1, slot2 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {})
      await swapService.volunteerForSwap(swap.id, orgMember2.id, slot2.id, org.id)

      // já está PENDING_LEADER, não pode aceitar de novo
      await expect(
        swapService.volunteerForSwap(swap.id, orgMember2.id, slot2.id, org.id)
      ).rejects.toThrow(BadRequestError)
    })
  })

  describe('volunteerReject', () => {
    it('deve voltar pra PENDING_OPEN quando voluntário desiste', async () => {
      const { org, orgMember1, orgMember2, slot1, slot2 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {})
      await swapService.volunteerForSwap(swap.id, orgMember2.id, slot2.id, org.id)

      const rejected = await swapService.volunteerReject(swap.id, orgMember2.id, org.id, 'Mudei de ideia')

      expect(rejected.status).toBe('PENDING_OPEN')
      expect(rejected.volunteer).toBeNull()
    })

    it('não deve permitir quem não é o voluntário desistir', async () => {
      const { org, orgMember1, orgMember2, slot1, slot2 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {})
      await swapService.volunteerForSwap(swap.id, orgMember2.id, slot2.id, org.id)

      await expect(
        swapService.volunteerReject(swap.id, orgMember1.id, org.id)
      ).rejects.toThrow(ForbiddenError)
    })
  })

  describe('cancelSwap', () => {
    it('solicitante deve conseguir cancelar troca aberta', async () => {
      const { org, orgMember1, slot1 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {})
      const cancelled = await swapService.cancelSwap(swap.id, orgMember1.id, org.id)

      expect(cancelled.status).toBe('CANCELLED')
    })

    it('não deve permitir outro membro cancelar', async () => {
      const { org, orgMember1, orgMember2, slot1 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {})

      await expect(
        swapService.cancelSwap(swap.id, orgMember2.id, org.id)
      ).rejects.toThrow(ForbiddenError)
    })
  })

  describe('reviewByLeader', () => {
    it('deve aprovar troca e trocar role_labels entre os slots', async () => {
      const { org, leader, orgMember1, orgMember2, slot1, slot2 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {})
      await swapService.volunteerForSwap(swap.id, orgMember2.id, slot2.id, org.id)
      const approved = await swapService.reviewByLeader(swap.id, leader.id, org.id, 'APPROVE')

      expect(approved.status).toBe('APPROVED')

      const updatedSlot1 = await prisma.scheduleSlot.findUnique({ where: { id: slot1.id } })
      const updatedSlot2 = await prisma.scheduleSlot.findUnique({ where: { id: slot2.id } })

      // member_id NÃO muda — só role_labels trocam
      expect(updatedSlot1?.member_id).toBe(orgMember1.id)
      expect(updatedSlot2?.member_id).toBe(orgMember2.id)
      expect(updatedSlot1?.role_labels).toEqual(['Baixo'])
      expect(updatedSlot2?.role_labels).toEqual(['Violão'])
    })

    it('rejeição do líder deve voltar pra PENDING_OPEN', async () => {
      const { org, leader, orgMember1, orgMember2, slot1, slot2 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {})
      await swapService.volunteerForSwap(swap.id, orgMember2.id, slot2.id, org.id)

      const rejected = await swapService.reviewByLeader(
        swap.id, leader.id, org.id, 'REJECT', 'Não autorizo'
      )

      expect(rejected.status).toBe('PENDING_OPEN')
      expect(rejected.volunteer).toBeNull()
    })
  })
})