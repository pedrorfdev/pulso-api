import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { OrganizationService } from './organization.service.js'
import { CreateOrgBody, UpdateOrgBody, CreateInviteBody } from './organization.schema.js'
import { requireRole } from '../../shared/middleware/require-role.js'

export async function organizationRoutes(app: FastifyInstance) {
  const orgService = new OrganizationService(prisma)

  // POST /organizations — cria uma nova org (usuário autenticado)
  app.post(
    '/',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const body = CreateOrgBody.parse(req.body)
      const org = await orgService.create(req.user.sub, body)
      return reply.status(201).send(org)
    }
  )

  // GET /organizations/:orgId/members
  app.get(
    '/:orgId/members',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }
      const members = await orgService.listMembers(orgId)
      return reply.send(members)
    }
  )

  // PATCH /organizations/:orgId — atualiza config da org (apenas ADMIN)
  app.patch(
    '/:orgId',
    { preHandler: [app.authenticate, requireRole('ADMIN')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }
      const body = UpdateOrgBody.parse(req.body)
      const org = await orgService.update(orgId, body)
      return reply.send(org)
    }
  )

  // POST /organizations/:orgId/invites — cria link de convite (LEADER+)
  app.post(
    '/:orgId/invites',
    { preHandler: [app.authenticate, requireRole('LEADER')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }
      const body = CreateInviteBody.parse(req.body)
      const invite = await orgService.createInviteLink(orgId, req.user.sub, body)
      return reply.status(201).send(invite)
    }
  )

  // POST /organizations/join/:token — entra na org via link de convite
  app.post(
    '/join/:token',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { token } = req.params as { token: string }
      const member = await orgService.joinByInvite(req.user.sub, token)
      return reply.status(201).send(member)
    }
  )
}