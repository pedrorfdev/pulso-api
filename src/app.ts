import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { env } from './lib/env.js'
import { errorHandler } from './plugins/error-handler.js'

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

  // ── error handler global
  await errorHandler(app)

  // ── health check
  app.get('/health', async () => ({ status: 'ok', env: env.NODE_ENV }))

  // ── módulos (serão registrados aqui nas fases seguintes)
  // await app.register(authRoutes, { prefix: '/auth' })
  // await app.register(organizationRoutes, { prefix: '/organizations' })
  // ...

  return app
}