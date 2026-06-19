import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { NotificationService } from './notification.service.js'
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

// rotas de push NÃO escopadas por organização (subscription é por usuário)
// registrar SEM prefix
export async function pushRoutes(app: FastifyInstance) {
  const notifService = new NotificationService(prisma)

  // GET /push/vapid-public-key
  app.get('/push/vapid-public-key', async (_req, reply) => {
    return reply.send({ publicKey: env.VAPID_PUBLIC_KEY })
  })

  // POST /push/subscribe
  app.post(
    '/push/subscribe',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { subscription } = SubscribeBody.parse(req.body)
      await notifService.saveSubscription(req.user.sub, subscription)
      return reply.status(201).send({ ok: true })
    }
  )
}