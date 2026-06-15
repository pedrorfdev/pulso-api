import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { env } from './lib/env.js'
import { errorHandler } from './plugins/error-handler.js'
import { authenticatePlugin } from './shared/middleware/authenticate.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { organizationRoutes } from './modules/organization/organization.routes.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  })

  // ── segurança
  await app.register(helmet)
  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  })
  await app.register(cookie)
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: 'token',
      signed: false,
    },
  })

  // ── plugins internos
  await app.register(authenticatePlugin)

  // ── error handler global
  await errorHandler(app)

  // ── health check
  app.get('/health', async () => ({ status: 'ok', env: env.NODE_ENV }))

  // ── módulos
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(organizationRoutes, { prefix: '/organizations' })

  return app
}