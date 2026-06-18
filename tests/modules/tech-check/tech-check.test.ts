import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../../src/lib/prisma.js'
import { TechCheckService } from '../../../src/modules/tech-check/tech-check.service.js'
import { NotFoundError } from '../../../src/shared/errors/app-error.js'

const techCheckService = new TechCheckService(prisma)

async function setup() {
  const user = await prisma.user.create({
    data: { name: 'Leader', email: `tc${Date.now()}@pulso.app`, google_id: `gtc${Date.now()}` },
  })
  const org = await prisma.organization.create({
    data: {
      name: 'TC Org',
      slug: `tc-org-${Date.now()}`,
      created_by: user.id,
      confirmation_deadline_hours: 48,
    },
  })
  const member = await prisma.organizationMember.create({
    data: { user_id: user.id, organization_id: org.id, role: 'LEADER' },
  })
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const event = await prisma.event.create({
    data: {
      organization_id: org.id,
      created_by: user.id,
      title: 'Culto',
      starts_at: startsAt,
      confirmation_deadline: new Date(startsAt.getTime() - 48 * 60 * 60 * 1000),
      is_published: true,
    },
  })
  return { user, org, member, event }
}

describe('TechCheckService', () => {
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

  describe('createItem', () => {
    it('deve criar item de tech check', async () => {
      const { user, org, event } = await setup()

      const item = await techCheckService.createItem(event.id, org.id, user.id, {
        label: 'Cabo P10',
        category: 'Cabos',
        is_critical: true,
      })

      expect(item.label).toBe('Cabo P10')
      expect(item.category).toBe('Cabos')
      expect(item.is_critical).toBe(true)
      expect(item.assignments).toHaveLength(0)
    })

    it('deve lançar NotFoundError se evento não existe', async () => {
      const { user, org } = await setup()

      await expect(
        techCheckService.createItem('00000000-0000-0000-0000-000000000000', org.id, user.id, {
          label: 'Item',
          is_critical: false,
        })
      ).rejects.toThrow(NotFoundError)
    })
  })

  describe('assignMember', () => {
    it('deve atribuir membro ao item e criar assignment PENDING', async () => {
      const { user, org, event } = await setup()

      const item = await techCheckService.createItem(event.id, org.id, user.id, {
        label: 'DI Box',
        is_critical: true,
      })

      const updated = await techCheckService.assignMember(item.id, org.id, {
        member_id: user.id,
      })

      expect(updated.assignments).toHaveLength(1)
      expect(updated.assignments[0].status).toBe('PENDING')
      expect(updated.assignments[0].member.user.name).toBe('Leader')
    })

    it('deve ser idempotente — não duplica assignment', async () => {
      const { user, org, event } = await setup()

      const item = await techCheckService.createItem(event.id, org.id, user.id, {
        label: 'Cabo XLR',
        is_critical: false,
      })

      await techCheckService.assignMember(item.id, org.id, { member_id: user.id })
      const result = await techCheckService.assignMember(item.id, org.id, { member_id: user.id })

      // upsert garante que não duplica
      expect(result.assignments).toHaveLength(1)
    })
  })

  describe('updateAssignment', () => {
    it('deve marcar item como CHECKED e salvar checked_at', async () => {
      const { user, org, member, event } = await setup()

      const item = await techCheckService.createItem(event.id, org.id, user.id, {
        label: 'Violão',
        is_critical: false,
      })

      const assigned = await techCheckService.assignMember(item.id, org.id, { member_id: user.id })
      const assignmentId = assigned.assignments[0].id

      const updated = await techCheckService.updateAssignment(
        assignmentId,
        member.id,
        org.id,
        { status: 'CHECKED' }
      )

      const checkedAssignment = updated.assignments.find((a) => a.id === assignmentId)
      expect(checkedAssignment?.status).toBe('CHECKED')
      expect(checkedAssignment?.checked_at).toBeTruthy()
    })

    it('deve limpar checked_at ao marcar como MISSING', async () => {
      const { user, org, member, event } = await setup()

      const item = await techCheckService.createItem(event.id, org.id, user.id, {
        label: 'Bateria',
        is_critical: false,
      })

      const assigned = await techCheckService.assignMember(item.id, org.id, { member_id: user.id })
      const assignmentId = assigned.assignments[0].id

      // marca como checked primeiro
      await techCheckService.updateAssignment(assignmentId, member.id, org.id, { status: 'CHECKED' })

      // depois marca como missing
      const updated = await techCheckService.updateAssignment(
        assignmentId,
        member.id,
        org.id,
        { status: 'MISSING' }
      )

      const a = updated.assignments.find((a) => a.id === assignmentId)
      expect(a?.status).toBe('MISSING')
      expect(a?.checked_at).toBeNull()
    })
  })

  describe('listItems', () => {
    it('deve listar itens agrupados por categoria', async () => {
      const { user, org, event } = await setup()

      await techCheckService.createItem(event.id, org.id, user.id, { label: 'DI Box', category: 'Equipamento', is_critical: true })
      await techCheckService.createItem(event.id, org.id, user.id, { label: 'Violão', category: 'Instrumentos', is_critical: false })
      await techCheckService.createItem(event.id, org.id, user.id, { label: 'Cabo P10', category: 'Cabos', is_critical: false })

      const items = await techCheckService.listItems(event.id, org.id)
      expect(items).toHaveLength(3)

      // verifica ordem: Cabos → Equipamento → Instrumentos (alfabética)
      expect(items[0].category).toBe('Cabos')
      expect(items[1].category).toBe('Equipamento')
      expect(items[2].category).toBe('Instrumentos')
    })
  })
})