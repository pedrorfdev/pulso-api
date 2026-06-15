import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { ForbiddenError, UnauthorizedError } from '../errors/app-error.js'
import type { OrgRole } from '../../../src/lib/prisma/generated/index.js'

// hierarquia de roles — ADMIN pode tudo que LEADER pode, LEADER pode tudo que MEMBER pode
const ROLE_HIERARCHY: Record<OrgRole, number> = {
  ADMIN: 3,
  LEADER: 2,
  MEMBER: 1,
}

// estende o req pra incluir o membro da org no contexto
declare module 'fastify' {
  interface FastifyRequest {
    orgMember: {
      id: string
      role: OrgRole
      organization_id: string
    }
  }
}

export function requireRole(minimumRole: OrgRole) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!req.user?.sub) {
      throw new UnauthorizedError()
    }

    // o organization_id vem do param da rota (/organizations/:orgId/...)
    const orgId = (req.params as Record<string, string>).orgId

    if (!orgId) {
      throw new ForbiddenError('Organization context required')
    }

    const member = await prisma.organizationMember.findUnique({
      where: {
        user_id_organization_id: {
          user_id: req.user.sub,
          organization_id: orgId,
        },
      },
      select: { id: true, role: true, organization_id: true, is_active: true },
    })

    if (!member || !member.is_active) {
      throw new ForbiddenError('You are not a member of this organization')
    }

    if (ROLE_HIERARCHY[member.role] < ROLE_HIERARCHY[minimumRole]) {
      throw new ForbiddenError('Insufficient permissions')
    }

    // injeta o membro no contexto da request pra não buscar de novo nos services
    req.orgMember = {
      id: member.id,
      role: member.role,
      organization_id: member.organization_id,
    }
  }
}