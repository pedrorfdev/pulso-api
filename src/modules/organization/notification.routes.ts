import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { NotificationService } from './notification.service.js'
import { requireRole } from '../../shared/middleware/require-role.js'

// rotas de notificação ESCOPADAS por organização
// registrar com prefix: '/organizations'
export async function notificationRoutes(app: FastifyInstance) {
  const notifService = new NotificationService(prisma)

  // GET /organizations/:orgId/notifications
  app.get(
    '/:orgId/notifications',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }
      const notifications = await notifService.listNotifications(req.user.sub, orgId)
      return reply.send(notifications)
    }
  )

  // PATCH /organizations/:orgId/notifications/:notificationId/read
  app.patch(
    '/:orgId/notifications/:notificationId/read',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { notificationId } = req.params as { orgId: string; notificationId: string }
      await notifService.markRead(notificationId, req.user.sub)
      return reply.send({ ok: true })
    }
  )

  // PATCH /organizations/:orgId/notifications/read-all
  app.patch(
    '/:orgId/notifications/read-all',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }
      await notifService.markAllRead(req.user.sub, orgId)
      return reply.send({ ok: true })
    }
  )
}