import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { SwapService } from './swap.service.js'
import { CreateSwapBody, ReviewSwapBody } from './swap.schema.js'
import { requireRole } from '../../shared/middleware/require-role.js'

export async function swapRoutes(app: FastifyInstance) {
  const swapService = new SwapService(prisma)

  // GET /organizations/:orgId/swaps — lista swaps do membro
  app.get(
    '/:orgId/swaps',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }
      const swaps = await swapService.listSwaps(orgId, req.orgMember.id)
      return reply.send(swaps)
    }
  )

  // GET /organizations/:orgId/swaps/pending — swaps aguardando líder
  app.get(
    '/:orgId/swaps/pending',
    { preHandler: [app.authenticate, requireRole('LEADER')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }
      const swaps = await swapService.listPendingForLeader(orgId)
      return reply.send(swaps)
    }
  )

  // POST /organizations/:orgId/slots/:slotId/swaps — solicita troca
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

  // PATCH /organizations/:orgId/swaps/:swapId/target — target aceita/recusa
  app.patch(
    '/:orgId/swaps/:swapId/target',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId, swapId } = req.params as { orgId: string; swapId: string }
      const body = ReviewSwapBody.parse(req.body)
      const swap = await swapService.reviewByTarget(swapId, req.orgMember.id, orgId, body)

      // notifica via socket
      app.io?.to(`org:${orgId}`).emit('swap:updated', swap)

      return reply.send(swap)
    }
  )

  // PATCH /organizations/:orgId/swaps/:swapId/leader — líder aprova/recusa
  app.patch(
    '/:orgId/swaps/:swapId/leader',
    { preHandler: [app.authenticate, requireRole('LEADER')] },
    async (req, reply) => {
      const { orgId, swapId } = req.params as { orgId: string; swapId: string }
      const body = ReviewSwapBody.parse(req.body)
      const swap = await swapService.reviewByLeader(swapId, req.user.sub, orgId, body)

      app.io?.to(`org:${orgId}`).emit('swap:updated', swap)

      return reply.send(swap)
    }
  )
}