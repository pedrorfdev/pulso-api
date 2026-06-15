import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../src/lib/prisma.js'
import { OrganizationService } from '../../src/modules/organization/organization.service.js'
import { ConflictError, NotFoundError } from '../../src/shared/errors/app-error.js'

const orgService = new OrganizationService(prisma)

// ── helpers de seed local
async function createTestUser(suffix = '1') {
  return prisma.user.create({
    data: {
      name: `Test User ${suffix}`,
      email: `test${suffix}@pulso.app`,
      google_id: `google_${suffix}_${Date.now()}`,
    },
  })
}

describe('OrganizationService', () => {
  // limpa as tabelas relevantes antes de cada teste
  beforeEach(async () => {
    await prisma.organizationMember.deleteMany()
    await prisma.organization.deleteMany()
    await prisma.user.deleteMany()
  })

  // ── create
  describe('create', () => {
    it('deve criar uma org e adicionar o criador como ADMIN', async () => {
      const user = await createTestUser()

      const org = await orgService.create(user.id, {
        name: 'Jovens Conexão',
        slug: 'jovens-cx',
        confirmation_deadline_hours: 48,
      })

      expect(org.name).toBe('Jovens Conexão')
      expect(org.slug).toBe('jovens-cx')

      const member = await prisma.organizationMember.findFirst({
        where: { user_id: user.id, organization_id: org.id },
      })

      expect(member?.role).toBe('ADMIN')
    })

    it('deve lançar ConflictError se o slug já existe', async () => {
      const user = await createTestUser()
      await orgService.create(user.id, { name: 'Org 1', slug: 'slug-unico', confirmation_deadline_hours: 48 })

      await expect(
        orgService.create(user.id, { name: 'Org 2', slug: 'slug-unico', confirmation_deadline_hours: 48 })
      ).rejects.toThrow(ConflictError)
    })
  })

  // ── findBySlug
  describe('findBySlug', () => {
    it('deve retornar a org pelo slug', async () => {
      const user = await createTestUser()
      await orgService.create(user.id, { name: 'Org Test', slug: 'org-test', confirmation_deadline_hours: 48 })

      const org = await orgService.findBySlug('org-test')
      expect(org.slug).toBe('org-test')
    })

    it('deve lançar NotFoundError se slug não existe', async () => {
      await expect(orgService.findBySlug('nao-existe')).rejects.toThrow(NotFoundError)
    })
  })

  // ── joinByInvite
  describe('joinByInvite', () => {
    it('deve adicionar membro via link de convite e incrementar uses_count', async () => {
      const admin = await createTestUser('admin')
      const member = await createTestUser('member')

      const org = await orgService.create(admin.id, {
        name: 'Org Invite',
        slug: 'org-invite',
        confirmation_deadline_hours: 48,
      })

      const adminMember = await prisma.organizationMember.findFirst({
        where: { user_id: admin.id },
      })

      const invite = await orgService.createInviteLink(org.id, admin.id, {
        role_to_assign: 'MEMBER',
      })

      const joined = await orgService.joinByInvite(member.id, invite.token)

      expect(joined.role).toBe('MEMBER')
      expect(joined.user.id).toBe(member.id)

      const updatedInvite = await prisma.inviteLink.findUnique({
        where: { token: invite.token },
      })
      expect(updatedInvite?.uses_count).toBe(1)
    })

    it('deve lançar ConflictError se convite expirou', async () => {
      const admin = await createTestUser('admin2')
      const member = await createTestUser('member2')

      const org = await orgService.create(admin.id, {
        name: 'Org Exp',
        slug: 'org-exp',
        confirmation_deadline_hours: 48,
      })

      // cria convite já expirado direto no banco
      const expired = await prisma.inviteLink.create({
        data: {
          organization_id: org.id,
          created_by: admin.id,
          token: 'expired-token-test',
          role_to_assign: 'MEMBER',
          expires_at: new Date(Date.now() - 1000), // já expirou
        },
      })

      await expect(
        orgService.joinByInvite(member.id, expired.token)
      ).rejects.toThrow(ConflictError)
    })

    it('deve lançar ConflictError se membro já pertence à org', async () => {
      const admin = await createTestUser('admin3')

      const org = await orgService.create(admin.id, {
        name: 'Org Dup',
        slug: 'org-dup',
        confirmation_deadline_hours: 48,
      })

      const invite = await orgService.createInviteLink(org.id, admin.id, {
        role_to_assign: 'MEMBER',
      })

      // admin já é membro — tenta entrar de novo
      await expect(
        orgService.joinByInvite(admin.id, invite.token)
      ).rejects.toThrow(ConflictError)
    })
  })
})