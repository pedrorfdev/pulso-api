import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { env } from './lib/env.js'
import { errorHandler } from './plugins/error-handler.js'
import { authenticatePlugin } from './shared/middleware/authenticate.js'
import { socketPlugin } from './plugins/socket.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { organizationRoutes } from './modules/organization/organization.routes.js'
import { scheduleRoutes } from './modules/schedule/schedule.routes.js'
import { swapRoutes } from './modules/swap/swap.routes.js'
import { songRoutes } from './modules/song/song.routes.js'
import { techCheckRoutes } from './modules/tech-check/tech-check.routes.js'

export async function buildApp() {
  const app = Fastify({
    logger: { level: env.NODE_ENV === 'test' ? 'silent' : 'info' },
  })

  await app.register(helmet)
  await app.register(cors, { origin: env.FRONTEND_URL, credentials: true })
  await app.register(cookie)
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: 'token', signed: false },
  })

  await app.register(authenticatePlugin)
  await app.register(socketPlugin)
  await errorHandler(app)

  app.get('/health', async () => ({ status: 'ok', env: env.NODE_ENV }))

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(organizationRoutes, { prefix: '/organizations' })
  await app.register(scheduleRoutes, { prefix: '/organizations' })
  await app.register(swapRoutes, { prefix: '/organizations' })
  await app.register(songRoutes, { prefix: '/organizations' })
  await app.register(techCheckRoutes, { prefix: '/organizations' })

  return app
}