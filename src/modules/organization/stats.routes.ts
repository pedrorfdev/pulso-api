import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { requireRole } from '../../shared/middleware/require-role.js'

export async function statsRoutes(app: FastifyInstance) {

  // GET /organizations/:orgId/stats — relatório geral da org (LEADER+)
  app.get(
    '/:orgId/stats',
    { preHandler: [app.authenticate, requireRole('LEADER')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }

      const members = await prisma.organizationMember.findMany({
        where: { organization_id: orgId, is_active: true },
        include: {
          user: { select: { name: true, avatar_url: true } },
          stats: true,
        },
        orderBy: { joined_at: 'asc' },
      })

      const org = await prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { absences_public: true, justifications_public: true },
      })

      const report = members.map((m) => ({
        member_id: m.id,
        role: m.role,
        user: m.user,
        stats: m.stats
          ? {
              confirmed_on_time: m.stats.confirmed_on_time,
              confirmed_late: m.stats.confirmed_late,
              // faltas sempre visíveis pro líder
              absences: m.stats.absences,
              deadline_misses: m.stats.deadline_misses,
              swaps_requested: m.stats.swaps_requested,
              swaps_accepted: m.stats.swaps_accepted,
              reliability_score: m.stats.reliability_score,
            }
          : null,
      }))

      return reply.send({ org_settings: org, members: report })
    }
  )

  // GET /organizations/:orgId/stats/me — stats do próprio membro
  app.get(
    '/:orgId/stats/me',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }

      const stats = await prisma.memberStats.findUnique({
        where: { member_id: req.orgMember.id },
      })

      return reply.send(stats ?? { reliability_score: 100 })
    }
  )

  // GET /organizations/:orgId/members/absences — lista pública de faltas (se org permitir)
  app.get(
    '/:orgId/members/absences',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }

      const org = await prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { absences_public: true, justifications_public: true },
      })

      const members = await prisma.organizationMember.findMany({
        where: { organization_id: orgId, is_active: true },
        include: {
          user: { select: { name: true, avatar_url: true } },
          stats: { select: { absences: true, deadline_misses: true, reliability_score: true } },
          attendances: org.justifications_public
            ? {
                where: { status: 'DECLINED' },
                select: { justification: true, created_at: true },
                orderBy: { created_at: 'desc' },
                take: 5,
              }
            : false,
        },
      })

      const result = members.map((m) => ({
        member_id: m.id,
        user: m.user,
        absences: org.absences_public ? m.stats?.absences ?? 0 : null,
        deadline_misses: org.absences_public ? m.stats?.deadline_misses ?? 0 : null,
        reliability_score: org.absences_public ? m.stats?.reliability_score ?? 100 : null,
        recent_justifications: org.justifications_public
          ? (m.attendances as { justification: string | null; created_at: Date }[])
          : null,
      }))

      return reply.send(result)
    }
  )
}