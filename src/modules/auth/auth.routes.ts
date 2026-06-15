import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { env } from '../../lib/env.js'
import { AuthService } from './auth.service.js'
import { GoogleCallbackQuery } from './auth.schema.js'

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService(prisma)

  // GET /auth/google — redireciona pro Google
  app.get('/google', async (_req, reply) => {
    const url = authService.getGoogleAuthUrl()
    return reply.redirect(url)
  })

  // GET /auth/google/callback — Google redireciona aqui com o code
  app.get<{ Querystring: GoogleCallbackQuery }>(
    '/google/callback',
    async (req, reply) => {
      const { code } = GoogleCallbackQuery.parse(req.query)

      const user = await authService.handleCallback(code)

      const token = app.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: env.JWT_EXPIRES_IN }
      )

      // envia o token como cookie httpOnly e redireciona pro front
      return reply
        .setCookie('token', token, {
          httpOnly: true,
          secure: env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7, // 7 dias
        })
        .redirect(`${env.FRONTEND_URL}/auth/callback?token=${token}`)
    }
  )

  // GET /auth/me — retorna o usuário autenticado
  app.get(
    '/me',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: {
          id: true,
          name: true,
          email: true,
          avatar_url: true,
          created_at: true,
        },
      })

      if (!user) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'User not found' },
        })
      }

      return reply.send(user)
    }
  )

  // POST /auth/logout
  app.post('/logout', async (_req, reply) => {
    return reply
      .clearCookie('token', { path: '/' })
      .send({ message: 'Logged out' })
  })
}