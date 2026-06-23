import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { SwapService } from './swap.service.js'
import { CreateSwapBody, ReviewSwapBody } from './swap.schema.js'
import { requireRole } from '../../shared/middleware/require-role.js'
import { z } from 'zod'

const VolunteerBody = z.object({
  volunteer_slot_id: z.string().uuid(),
})

const LeaderReviewBody = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  rejection_reason: z.string().max(300).optional(),
})

export async function swapRoutes(app: FastifyInstance) {
  const swapService = new SwapService(prisma)

  // GET /organizations/:orgId/swaps — as próprias trocas do membro
  app.get(
    '/:orgId/swaps',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }
      return reply.send(await swapService.listSwaps(orgId, req.orgMember.id))
    }
  )

  // GET /organizations/:orgId/swaps/open — trocas abertas que qualquer um pode aceitar
  app.get(
    '/:orgId/swaps/open',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }
      return reply.send(await swapService.listOpenSwaps(orgId, req.orgMember.id))
    }
  )

  // GET /organizations/:orgId/swaps/pending-leader — aguardando aprovação [LEADER+]
  app.get(
    '/:orgId/swaps/pending-leader',
    { preHandler: [app.authenticate, requireRole('LEADER')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }
      return reply.send(await swapService.listPendingForLeader(orgId))
    }
  )

  // POST /organizations/:orgId/slots/:slotId/swaps — abre pedido de troca
  app.post(
    '/:orgId/slots/:slotId/swaps',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId, slotId } = req.params as { orgId: string; slotId: string }
      const body = CreateSwapBody.parse(req.body)
      const swap = await swapService.createSwap(orgId, req.orgMember.id, slotId, body)
      return reply.status(201).send(swap)
    }
  )

  // POST /organizations/:orgId/swaps/:swapId/volunteer — aceita a troca
  app.post(
    '/:orgId/swaps/:swapId/volunteer',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId, swapId } = req.params as { orgId: string; swapId: string }
      const { volunteer_slot_id } = VolunteerBody.parse(req.body)
      const swap = await swapService.volunteerForSwap(
        swapId,
        req.orgMember.id,
        volunteer_slot_id,
        orgId
      )
      app.io?.to(`org:${orgId}`).emit('swap:updated', swap)
      return reply.send(swap)
    }
  )

  // POST /organizations/:orgId/swaps/:swapId/volunteer-reject — voluntário desiste
  app.post(
    '/:orgId/swaps/:swapId/volunteer-reject',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId, swapId } = req.params as { orgId: string; swapId: string }
      const body = z.object({ rejection_reason: z.string().max(300).optional() }).parse(req.body)
      const swap = await swapService.volunteerReject(
        swapId,
        req.orgMember.id,
        orgId,
        body.rejection_reason
      )
      app.io?.to(`org:${orgId}`).emit('swap:updated', swap)
      return reply.send(swap)
    }
  )

  // DELETE /organizations/:orgId/swaps/:swapId — solicitante cancela
  app.delete(
    '/:orgId/swaps/:swapId',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId, swapId } = req.params as { orgId: string; swapId: string }
      const swap = await swapService.cancelSwap(swapId, req.orgMember.id, orgId)
      app.io?.to(`org:${orgId}`).emit('swap:updated', swap)
      return reply.status(200).send(swap)
    }
  )

  // PATCH /organizations/:orgId/swaps/:swapId/leader — líder aprova ou rejeita
  app.patch(
    '/:orgId/swaps/:swapId/leader',
    { preHandler: [app.authenticate, requireRole('LEADER')] },
    async (req, reply) => {
      const { orgId, swapId } = req.params as { orgId: string; swapId: string }
      const { action, rejection_reason } = LeaderReviewBody.parse(req.body)
      const swap = await swapService.reviewByLeader(
        swapId,
        req.user.sub,
        orgId,
        action,
        rejection_reason
      )
      app.io?.to(`org:${orgId}`).emit('swap:updated', swap)
      return reply.send(swap)
    }
  )
}