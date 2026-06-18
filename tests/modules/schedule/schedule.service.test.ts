import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../../src/lib/prisma.js'
import { ScheduleService } from '../../../src/modules/schedule/schedule.service.js'
import { BadRequestError } from '../../../src/shared/errors/app-error.js'

const scheduleService = new ScheduleService(prisma)

// ── helpers
async function createTestUser(suffix: string) {
  return prisma.user.create({
    data: {
      name: `User ${suffix}`,
      email: `${suffix}@pulso.app`,
      google_id: `google_${suffix}_${Date.now()}`,
    },
  })
}

async function createTestOrg(userId: string, slug: string) {
  return prisma.organization.create({
    data: {
      name: `Org ${slug}`,
      slug,
      created_by: userId,
      confirmation_deadline_hours: 48,
      members: { create: { user_id: userId, role: 'ADMIN' } },
    },
  })
}

async function getOrgMember(userId: string, orgId: string) {
  return prisma.organizationMember.findUniqueOrThrow({
    where: { user_id_organization_id: { user_id: userId, organization_id: orgId } },
  })
}

// data futura garantida (7 dias a frente)
function futureDate(daysAhead = 7) {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString()
}

describe('ScheduleService', () => {
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

  // ── createEvent
  describe('createEvent', () => {
    it('deve criar evento com confirmation_deadline calculado', async () => {
      const user = await createTestUser('leader1')
      const org = await createTestOrg(user.id, 'org-ev1')

      const event = await scheduleService.createEvent(org.id, user.id, {
        title: 'Culto de Domingo',
        starts_at: futureDate(7),
      })

      expect(event.title).toBe('Culto de Domingo')
      expect(event.is_published).toBe(false)

      // deadline = starts_at - 48h
      const diff =
        new Date(event.starts_at).getTime() -
        new Date(event.confirmation_deadline).getTime()
      expect(diff).toBe(48 * 60 * 60 * 1000)
    })

    it('deve lançar BadRequestError se data é muito próxima', async () => {
      const user = await createTestUser('leader2')
      const org = await createTestOrg(user.id, 'org-ev2')

      await expect(
        scheduleService.createEvent(org.id, user.id, {
          title: 'Evento urgente',
          starts_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h
        })
      ).rejects.toThrow(BadRequestError)
    })
  })

  // ── addSlot + publishEvent
  describe('addSlot e publishEvent', () => {
    it('deve adicionar slot e criar attendance PENDING', async () => {
      const user = await createTestUser('leader3')
      const org = await createTestOrg(user.id, 'org-slot1')
      const member = await getOrgMember(user.id, org.id)

      const event = await scheduleService.createEvent(org.id, user.id, {
        title: 'Culto',
        starts_at: futureDate(7),
      })

      const slot = await scheduleService.addSlot(event.id, org.id, {
        member_id: user.id,
        role_label: 'Violão',
      })

      expect(slot.role_label).toBe('Violão')
      expect(slot.attendance?.status).toBe('PENDING')
    })

    it('deve lançar BadRequestError ao publicar sem slots', async () => {
      const user = await createTestUser('leader4')
      const org = await createTestOrg(user.id, 'org-slot2')

      const event = await scheduleService.createEvent(org.id, user.id, {
        title: 'Culto vazio',
        starts_at: futureDate(7),
      })

      await expect(
        scheduleService.publishEvent(event.id, org.id)
      ).rejects.toThrow(BadRequestError)
    })

    it('deve publicar evento com slots', async () => {
      const user = await createTestUser('leader5')
      const org = await createTestOrg(user.id, 'org-slot3')

      const event = await scheduleService.createEvent(org.id, user.id, {
        title: 'Culto publicado',
        starts_at: futureDate(7),
      })

      await scheduleService.addSlot(event.id, org.id, {
        member_id: user.id,
        role_label: 'Baixo',
      })

      const published = await scheduleService.publishEvent(event.id, org.id)
      expect(published.is_published).toBe(true)
    })
  })

  // ── confirmAttendance
  describe('confirmAttendance', () => {
    it('deve confirmar presença e atualizar stats', async () => {
      const user = await createTestUser('member6')
      const org = await createTestOrg(user.id, 'org-att1')
      const member = await getOrgMember(user.id, org.id)

      // garante que stats existe
      await prisma.memberStats.upsert({
        where: { member_id: member.id },
        update: {},
        create: { member_id: member.id },
      })

      const event = await scheduleService.createEvent(org.id, user.id, {
        title: 'Culto confirm',
        starts_at: futureDate(7),
      })

      await scheduleService.addSlot(event.id, org.id, {
        member_id: user.id,
        role_label: 'Teclado',
      })

      const attendance = await prisma.attendance.findFirstOrThrow({
        where: { member_id: member.id },
      })

      const result = await scheduleService.confirmAttendance(
        attendance.id,
        member.id,
        org.id,
        { status: 'CONFIRMED' }
      )

      expect(result.status).toBe('CONFIRMED')

      const stats = await prisma.memberStats.findUnique({
        where: { member_id: member.id },
      })
      expect(stats?.confirmed_on_time).toBe(1)
    })

    it('deve lançar BadRequestError ao confirmar duas vezes', async () => {
      const user = await createTestUser('member7')
      const org = await createTestOrg(user.id, 'org-att2')
      const member = await getOrgMember(user.id, org.id)

      await prisma.memberStats.upsert({
        where: { member_id: member.id },
        update: {},
        create: { member_id: member.id },
      })

      const event = await scheduleService.createEvent(org.id, user.id, {
        title: 'Culto dup',
        starts_at: futureDate(7),
      })

      await scheduleService.addSlot(event.id, org.id, {
        member_id: user.id,
        role_label: 'Bateria',
      })

      const attendance = await prisma.attendance.findFirstOrThrow({
        where: { member_id: member.id },
      })

      await scheduleService.confirmAttendance(attendance.id, member.id, org.id, {
        status: 'CONFIRMED',
      })

      await expect(
        scheduleService.confirmAttendance(attendance.id, member.id, org.id, {
          status: 'CONFIRMED',
        })
      ).rejects.toThrow(BadRequestError)
    })

    it('deve lançar BadRequestError ao declinar sem justificativa', async () => {
      const user = await createTestUser('member8')
      const org = await createTestOrg(user.id, 'org-att3')
      const member = await getOrgMember(user.id, org.id)

      await prisma.memberStats.upsert({
        where: { member_id: member.id },
        update: {},
        create: { member_id: member.id },
      })

      const event = await scheduleService.createEvent(org.id, user.id, {
        title: 'Culto sem just',
        starts_at: futureDate(7),
      })

      await scheduleService.addSlot(event.id, org.id, {
        member_id: user.id,
        role_label: 'Violão',
      })

      const attendance = await prisma.attendance.findFirstOrThrow({
        where: { member_id: member.id },
      })

      // o Zod refine vai barrar isso antes do service
      expect(() =>
        ConfirmAttendanceBody.parse({ status: 'DECLINED' })
      ).toThrow()
    })
  })
})

// importa pra usar no último teste
import { ConfirmAttendanceBody } from '../../../src/modules/schedule/schedule.schema.js'