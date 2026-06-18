import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../src/lib/prisma'

// testa a lógica do job diretamente, sem o cron
async function runDeadlineCheck() {
  const expired = await prisma.attendance.findMany({
    where: {
      status: 'PENDING',
      slot: {
        event: {
          confirmation_deadline: { lt: new Date() },
          is_published: true,
        },
      },
    },
  })

  for (const attendance of expired) {
    await prisma.attendance.update({
      where: { id: attendance.id },
      data: { status: 'DEADLINE_MISSED' },
    })
    await prisma.memberStats.upsert({
      where: { member_id: attendance.member_id },
      update: { deadline_misses: { increment: 1 } },
      create: { member_id: attendance.member_id, deadline_misses: 1 },
    })
  }

  return expired.length
}

describe('DeadlineJob', () => {
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

  it('deve marcar attendance como DEADLINE_MISSED quando prazo venceu', async () => {
    const user = await prisma.user.create({
      data: { name: 'Membro', email: `dj${Date.now()}@pulso.app`, google_id: `gdj${Date.now()}` },
    })
    const org = await prisma.organization.create({
      data: { name: 'Org', slug: `dj-org-${Date.now()}`, created_by: user.id, confirmation_deadline_hours: 48 },
    })
    const member = await prisma.organizationMember.create({
      data: { user_id: user.id, organization_id: org.id, role: 'MEMBER' },
    })

    // evento com deadline já passado
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // ontem
    const event = await prisma.event.create({
      data: {
        organization_id: org.id,
        created_by: user.id,
        title: 'Culto passado',
        starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        confirmation_deadline: pastDate,
        is_published: true,
      },
    })

    const slot = await prisma.scheduleSlot.create({
      data: { event_id: event.id, member_id: member.id, role_label: 'Violão' },
    })

    await prisma.attendance.create({
      data: { slot_id: slot.id, member_id: member.id, status: 'PENDING' },
    })

    const processed = await runDeadlineCheck()
    expect(processed).toBe(1)

    const updated = await prisma.attendance.findFirst({ where: { slot_id: slot.id } })
    expect(updated?.status).toBe('DEADLINE_MISSED')

    const stats = await prisma.memberStats.findUnique({ where: { member_id: member.id } })
    expect(stats?.deadline_misses).toBe(1)
  })

  it('não deve afetar attendances com deadline no futuro', async () => {
    const user = await prisma.user.create({
      data: { name: 'Membro2', email: `dj2${Date.now()}@pulso.app`, google_id: `gdj2${Date.now()}` },
    })
    const org = await prisma.organization.create({
      data: { name: 'Org2', slug: `dj-org2-${Date.now()}`, created_by: user.id, confirmation_deadline_hours: 48 },
    })
    const member = await prisma.organizationMember.create({
      data: { user_id: user.id, organization_id: org.id, role: 'MEMBER' },
    })

    const futureDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000)
    const event = await prisma.event.create({
      data: {
        organization_id: org.id,
        created_by: user.id,
        title: 'Culto futuro',
        starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        confirmation_deadline: futureDeadline,
        is_published: true,
      },
    })

    const slot = await prisma.scheduleSlot.create({
      data: { event_id: event.id, member_id: member.id, role_label: 'Baixo' },
    })

    await prisma.attendance.create({
      data: { slot_id: slot.id, member_id: member.id, status: 'PENDING' },
    })

    const processed = await runDeadlineCheck()
    expect(processed).toBe(0)

    const att = await prisma.attendance.findFirst({ where: { slot_id: slot.id } })
    expect(att?.status).toBe('PENDING')
  })
})