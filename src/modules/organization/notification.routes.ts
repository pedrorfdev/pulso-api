import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { NotificationService } from './notification.service.js'
import { requireRole } from '../../shared/middleware/require-role.js'
import { env } from '../../lib/env.js'

const SubscribeBody = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
})

export async function notificationRoutes(app: FastifyInstance) {
  const notifService = new NotificationService(prisma)

  // GET /push/vapid-public-key — front precisa disso pra registrar o service worker
  app.get('/push/vapid-public-key', async (_req, reply) => {
    return reply.send({ publicKey: env.VAPID_PUBLIC_KEY })
  })

  // POST /push/subscribe — salva subscription do dispositivo
  app.post(
    '/push/subscribe',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { subscription } = SubscribeBody.parse(req.body)
      await notifService.saveSubscription(req.user.sub, subscription)
      return reply.status(201).send({ ok: true })
    }
  )

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

  // PATCH /organizations/:orgId/notifications/:id/read
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