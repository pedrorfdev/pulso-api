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
    prisma.scheduleSlot.create({ data: { event_id: event.id, member_id: orgMember1.id, role_label: 'Violão' } }),
    prisma.scheduleSlot.create({ data: { event_id: event.id, member_id: orgMember2.id, role_label: 'Baixo' } }),
  ])

  return { org, leader, member1, member2, orgLeader, orgMember1, orgMember2, event, slot1, slot2 }
}

describe('SwapService', () => {
  beforeEach(async () => {
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
  })

  describe('createSwap', () => {
    it('deve criar swap com status PENDING_TARGET', async () => {
      const { org, orgMember1, slot1, slot2 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {
        target_slot_id: slot2.id,
        message: 'Preciso de ajuda',
      })

      expect(swap.status).toBe('PENDING_TARGET')
      expect(swap.requester.id).toBe(slot1.id)
    })

    it('deve lançar BadRequestError ao trocar consigo mesmo', async () => {
      const { org, orgMember1, slot1 } = await setup()

      await expect(
        swapService.createSwap(org.id, orgMember1.id, slot1.id, {
          target_slot_id: slot1.id,
        })
      ).rejects.toThrow(BadRequestError)
    })
  })

  describe('reviewByTarget', () => {
    it('deve mover pra PENDING_LEADER quando target aceita', async () => {
      const { org, orgMember1, orgMember2, slot1, slot2 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {
        target_slot_id: slot2.id,
      })

      const reviewed = await swapService.reviewByTarget(swap.id, orgMember2.id, org.id, {
        action: 'ACCEPT',
      })

      expect(reviewed.status).toBe('PENDING_LEADER')
    })

    it('deve mover pra REJECTED_TARGET quando target recusa', async () => {
      const { org, orgMember1, orgMember2, slot1, slot2 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {
        target_slot_id: slot2.id,
      })

      const reviewed = await swapService.reviewByTarget(swap.id, orgMember2.id, org.id, {
        action: 'REJECT',
        rejection_reason: 'Não consigo',
      })

      expect(reviewed.status).toBe('REJECTED_TARGET')
    })

    it('deve lançar ForbiddenError se não for o target', async () => {
      const { org, orgMember1, slot1, slot2 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {
        target_slot_id: slot2.id,
      })

      // orgMember1 tenta responder a própria troca
      await expect(
        swapService.reviewByTarget(swap.id, orgMember1.id, org.id, { action: 'ACCEPT' })
      ).rejects.toThrow(ForbiddenError)
    })
  })

  describe('reviewByLeader', () => {
    it('deve aprovar troca e trocar membros nos slots', async () => {
      const { org, leader, orgMember1, orgMember2, slot1, slot2 } = await setup()

      const swap = await swapService.createSwap(org.id, orgMember1.id, slot1.id, {
        target_slot_id: slot2.id,
      })

      await swapService.reviewByTarget(swap.id, orgMember2.id, org.id, { action: 'ACCEPT' })
      const approved = await swapService.reviewByLeader(swap.id, leader.id, org.id, { action: 'ACCEPT' })

      expect(approved.status).toBe('APPROVED')

      // verifica que os slots foram trocados
      const updatedSlot1 = await prisma.scheduleSlot.findUnique({ where: { id: slot1.id } })
      const updatedSlot2 = await prisma.scheduleSlot.findUnique({ where: { id: slot2.id } })

      expect(updatedSlot1?.member_id).toBe(orgMember2.id)
      expect(updatedSlot2?.member_id).toBe(orgMember1.id)
    })
  })
})