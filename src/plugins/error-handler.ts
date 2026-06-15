import type { FastifyInstance, FastifyError } from 'fastify'
import { AppError } from '../shared/errors/app-error.js'

export async function errorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      })
    }

    // erros de validação do Fastify/Zod
    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.validation,
        },
      })
    }

    // erro de JWT inválido/expirado
    if (
      error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID' ||
      error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED'
    ) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        },
      })
    }

    // qualquer coisa inesperada — não vaza stack em produção
    app.log.error(error)

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    })
  })
}