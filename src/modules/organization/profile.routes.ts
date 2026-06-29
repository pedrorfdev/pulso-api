import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { ProfileService } from "./profile.service.js";
import { UpdateProfileBody } from "./profile.schema.js";
import { requireRole } from "../../shared/middleware/require-role.js";

export async function profileRoutes(app: FastifyInstance) {
  const profileService = new ProfileService(prisma);

  // GET /organizations/:orgId/members/:memberId/profile
  // qualquer membro pode ver o perfil de outro, mas justificativas dependem da config
  app.get(
    "/:orgId/members/:memberId/profile",
    { preHandler: [app.authenticate, requireRole("MEMBER")] },
    async (req, reply) => {
      const { orgId, memberId } = req.params as {
        orgId: string;
        memberId: string;
      };
      const isLeader = ["ADMIN", "LEADER"].includes(req.orgMember.role);

      const profile = await profileService.getMemberProfile(
        memberId,
        orgId,
        req.orgMember.id,
        isLeader,
      );

      return reply.send(profile);
    },
  );

  // GET /organizations/:orgId/members/me/profile — atalho pro próprio perfil
  app.get(
    "/:orgId/members/me/profile",
    { preHandler: [app.authenticate, requireRole("MEMBER")] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string };
      const isLeader = ["ADMIN", "LEADER"].includes(req.orgMember.role);

      const profile = await profileService.getMemberProfile(
        req.orgMember.id,
        orgId,
        req.orgMember.id,
        isLeader,
      );

      return reply.send(profile);
    },
  );

  // PATCH /organizations/:orgId/members/me/profile — edita nickname
  app.patch(
    "/:orgId/members/me/profile",
    { preHandler: [app.authenticate, requireRole("MEMBER")] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string };
      const body = UpdateProfileBody.parse(req.body);

      const result = await profileService.updateProfile(
        req.orgMember.id,
        orgId,
        body,
      );
      return reply.send(result);
    },
  );

  // GET /organizations/:orgId/events/history — todos os eventos com detalhes completos
  // membros veem, mas justificativas dependem da config da org
  app.get(
    "/:orgId/events/history",
    { preHandler: [app.authenticate, requireRole("MEMBER")] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string };
      const isLeader = ["ADMIN", "LEADER"].includes(req.orgMember.role);

      const history = await profileService.listEventHistory(orgId, isLeader);
      return reply.send(history);
    },
  );
}
