import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { OrganizationService } from './organization.service.js'

// rotas sobre o usuário logado que NÃO são escopadas a uma única org
// (ex: listar todas as orgs que ele pertence). Registrar SEM prefix.
export async function meRoutes(app: FastifyInstance) {
  const orgService = new OrganizationService(prisma)

  // GET /me/organizations — orgs que o usuário logado pertence
  // usado pelo front logo após o login pra montar o seletor de org
  // ou redirecionar direto se a pessoa só tiver uma
  app.get(
    '/me/organizations',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const memberships = await orgService.listMyOrganizations(req.user.sub)
      return reply.send(memberships)
    }
  )
}