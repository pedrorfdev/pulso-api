import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { Server } from 'socket.io'
import { env } from '../lib/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    io: Server
  }
}

export const socketPlugin = fp(async (app: FastifyInstance) => {
  const allowedOrigins = [
    env.FRONTEND_URL,
    "https://rpulso.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
  ];

  const io = new Server(app.server, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const cleanOrigin = origin.replace(/\/$/, "");
        if (
          env.NODE_ENV === "development" ||
          allowedOrigins.includes(cleanOrigin) ||
          cleanOrigin.endsWith(".vercel.app")
        ) {
          return cb(null, true);
        }
        return cb(new Error("CORS origin not allowed"), false);
      },
      credentials: true,
    },
  });

  // autenticação no WebSocket — valida o JWT no handshake
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined

    if (!token) {
      return next(new Error('Token não fornecido'))
    }

    try {
      const decoded = app.jwt.verify<{ sub: string }>(token)
      socket.data.userId = decoded.sub
      next()
    } catch {
      next(new Error('Token inválido'))
    }
  })

  io.on('connection', (socket) => {
    app.log.info(`Socket conectado: ${socket.id} (user: ${socket.data.userId})`)

    // membro entra na sala da org pra receber atualizações ao vivo
    socket.on('join:org', (orgId: string) => {
      socket.join(`org:${orgId}`)
      app.log.info(`Socket ${socket.id} entrou na sala org:${orgId}`)
    })

    socket.on('disconnect', () => {
      app.log.info(`Socket desconectado: ${socket.id}`)
    })
  })

  app.decorate('io', io)

  // fecha o socket quando o Fastify fechar
  app.addHook('onClose', async () => {
    await io.close()
  })
})