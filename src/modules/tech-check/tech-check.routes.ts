import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { TechCheckService } from './tech-check.service.js'
import { CreateTechItemBody, AssignItemBody, UpdateAssignmentBody } from './tech-check.schema.js'
import { requireRole } from '../../shared/middleware/require-role.js'

export async function techCheckRoutes(app: FastifyInstance) {
  const techCheckService = new TechCheckService(prisma)

  // GET /organizations/:orgId/events/:eventId/tech-check
  app.get(
    '/:orgId/events/:eventId/tech-check',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId, eventId } = req.params as { orgId: string; eventId: string }
      return reply.send(await techCheckService.listItems(eventId, orgId))
    }
  )

  // POST /organizations/:orgId/events/:eventId/tech-check
  app.post(
    '/:orgId/events/:eventId/tech-check',
    { preHandler: [app.authenticate, requireRole('LEADER')] },
    async (req, reply) => {
      const { orgId, eventId } = req.params as { orgId: string; eventId: string }
      const body = CreateTechItemBody.parse(req.body)
      const item = await techCheckService.createItem(eventId, orgId, req.user.sub, body)
      return reply.status(201).send(item)
    }
  )

  // DELETE /organizations/:orgId/events/:eventId/tech-check/:itemId
  app.delete(
    '/:orgId/events/:eventId/tech-check/:itemId',
    { preHandler: [app.authenticate, requireRole('LEADER')] },
    async (req, reply) => {
      const { orgId, itemId } = req.params as { orgId: string; eventId: string; itemId: string }
      await techCheckService.deleteItem(itemId, orgId)
      return reply.status(204).send()
    }
  )

  // POST /organizations/:orgId/events/:eventId/tech-check/:itemId/assign
  app.post(
    '/:orgId/events/:eventId/tech-check/:itemId/assign',
    { preHandler: [app.authenticate, requireRole('LEADER')] },
    async (req, reply) => {
      const { orgId, itemId } = req.params as { orgId: string; eventId: string; itemId: string }
      const body = AssignItemBody.parse(req.body)
      const item = await techCheckService.assignMember(itemId, orgId, body)
      return reply.status(201).send(item)
    }
  )

  // PATCH /organizations/:orgId/tech-check/assignments/:assignmentId
  app.patch(
    '/:orgId/tech-check/assignments/:assignmentId',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId, assignmentId } = req.params as { orgId: string; assignmentId: string }
      const body = UpdateAssignmentBody.parse(req.body)
      const item = await techCheckService.updateAssignment(
        assignmentId,
        req.orgMember.id,
        orgId,
        body
      )
      return reply.send(item)
    }
  )
}