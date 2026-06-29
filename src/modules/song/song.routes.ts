import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { SongService } from "./song.service.js";
import { SpotifyService } from "./spotify.service.js";
import { CreateSongBody, AddEventSongBody } from "./song.schema.js";
import { requireRole } from "../../shared/middleware/require-role.js";

export async function songRoutes(app: FastifyInstance) {
  const songService = new SongService(prisma);
  const spotifyService = new SpotifyService();

  // GET /organizations/:orgId/songs/search?q=... — busca no Spotify [MEMBER+]
  // rota antes das outras pra não conflitar com /:orgId/songs/:songId
  app.get(
    "/:orgId/songs/search",
    { preHandler: [app.authenticate, requireRole("MEMBER")] },
    async (req, reply) => {
      const { q } = z.object({ q: z.string().min(1) }).parse(req.query);
      const results = await spotifyService.search(q);
      return reply.send(results);
    },
  );

  // GET /organizations/:orgId/songs — biblioteca da org
  app.get(
    "/:orgId/songs",
    { preHandler: [app.authenticate, requireRole("MEMBER")] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string };
      return reply.send(await songService.listOrgSongs(orgId));
    },
  );

  // POST /organizations/:orgId/songs
  app.post(
    "/:orgId/songs",
    { preHandler: [app.authenticate, requireRole("MEMBER")] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string };
      const body = CreateSongBody.parse(req.body);
      const song = await songService.createSong(orgId, req.user.sub, body);
      return reply.status(201).send(song);
    },
  );

  // DELETE /organizations/:orgId/songs/:songId
  app.delete(
    "/:orgId/songs/:songId",
    { preHandler: [app.authenticate, requireRole("LEADER")] },
    async (req, reply) => {
      const { orgId, songId } = req.params as { orgId: string; songId: string };
      await songService.deleteSong(songId, orgId);
      return reply.status(204).send();
    },
  );

  // GET /organizations/:orgId/events/:eventId/songs
  app.get(
    "/:orgId/events/:eventId/songs",
    { preHandler: [app.authenticate, requireRole("MEMBER")] },
    async (req, reply) => {
      const { orgId, eventId } = req.params as {
        orgId: string;
        eventId: string;
      };
      return reply.send(await songService.listEventSongs(eventId, orgId));
    },
  );

  // POST /organizations/:orgId/events/:eventId/songs
  app.post(
    "/:orgId/events/:eventId/songs",
    { preHandler: [app.authenticate, requireRole("LEADER")] },
    async (req, reply) => {
      const { orgId, eventId } = req.params as {
        orgId: string;
        eventId: string;
      };
      const body = AddEventSongBody.parse(req.body);
      const eventSong = await songService.addSongToEvent(eventId, orgId, body);
      return reply.status(201).send(eventSong);
    },
  );

  // DELETE /organizations/:orgId/events/:eventId/songs/:eventSongId
  app.delete(
    "/:orgId/events/:eventId/songs/:eventSongId",
    { preHandler: [app.authenticate, requireRole("LEADER")] },
    async (req, reply) => {
      const { orgId, eventSongId } = req.params as {
        orgId: string;
        eventId: string;
        eventSongId: string;
      };
      await songService.removeSongFromEvent(eventSongId, orgId);
      return reply.status(204).send();
    },
  );
}
