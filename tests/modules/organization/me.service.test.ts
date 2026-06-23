import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../../src/lib/prisma.js'
import { OrganizationService } from '../../../src/modules/organization/organization.service.js'

const orgService = new OrganizationService(prisma)

async function createTestUser(suffix: string) {
  return prisma.user.create({
    data: {
      name: `User ${suffix}`,
      email: `${suffix}@pulso.app`,
      google_id: `google_${suffix}_${Date.now()}`,
    },
  })
}

describe('OrganizationService.listMyOrganizations', () => {
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

  it('deve listar todas as orgs ativas que o usuário pertence', async () => {
    const user = await createTestUser('multi1')

    const org1 = await orgService.create(user.id, {
      name: 'Org A',
      slug: 'org-a-multi',
      confirmation_deadline_hours: 48,
    })
    const org2 = await orgService.create(user.id, {
      name: 'Org B',
      slug: 'org-b-multi',
      confirmation_deadline_hours: 48,
    })

    const memberships = await orgService.listMyOrganizations(user.id)

    expect(memberships).toHaveLength(2)
    expect(memberships.map((m) => m.organization.slug)).toEqual(
      expect.arrayContaining(['org-a-multi', 'org-b-multi'])
    )
    // o criador é ADMIN nas duas
    expect(memberships.every((m) => m.role === 'ADMIN')).toBe(true)
  })

  it('deve retornar lista vazia se o usuário não pertence a nenhuma org', async () => {
    const user = await createTestUser('lonely1')

    const memberships = await orgService.listMyOrganizations(user.id)

    expect(memberships).toEqual([])
  })

  it('não deve listar org onde o membro está inativo (is_active: false)', async () => {
    const user = await createTestUser('inactive1')

    const org = await orgService.create(user.id, {
      name: 'Org Inativa',
      slug: 'org-inativa-multi',
      confirmation_deadline_hours: 48,
    })

    // desativa o vínculo manualmente — simula saída do grupo
    await prisma.organizationMember.updateMany({
      where: { user_id: user.id, organization_id: org.id },
      data: { is_active: false },
    })

    const memberships = await orgService.listMyOrganizations(user.id)

    expect(memberships).toEqual([])
  })
})