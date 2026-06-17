import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { ScheduleService } from './schedule.service.js'
import {
  CreateEventBody,
  UpdateEventBody,
  AddSlotBody,
  ConfirmAttendanceBody,
} from './schedule.schema.js'
import { requireRole } from '../../shared/middleware/require-role.js'

export async function scheduleRoutes(app: FastifyInstance) {
  const scheduleService = new ScheduleService(prisma)

  // GET /organizations/:orgId/events — lista eventos da org
  app.get(
    '/:orgId/events',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }
      const events = await scheduleService.listEvents(orgId, req.orgMember.id)
      return reply.send(events)
    }
  )

  // GET /organizations/:orgId/events/:eventId — detalhe do evento
  app.get(
    '/:orgId/events/:eventId',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId, eventId } = req.params as { orgId: string; eventId: string }
      const event = await scheduleService.getEvent(eventId, orgId)
      return reply.send(event)
    }
  )

  // POST /organizations/:orgId/events — cria evento (LEADER+)
  app.post(
    '/:orgId/events',
    { preHandler: [app.authenticate, requireRole('LEADER')] },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string }
      const body = CreateEventBody.parse(req.body)
      const event = await scheduleService.createEvent(orgId, req.user.sub, body)
      return reply.status(201).send(event)
    }
  )

  // PATCH /organizations/:orgId/events/:eventId — atualiza evento (LEADER+)
  app.patch(
    '/:orgId/events/:eventId',
    { preHandler: [app.authenticate, requireRole('LEADER')] },
    async (req, reply) => {
      const { orgId, eventId } = req.params as { orgId: string; eventId: string }
      const body = UpdateEventBody.parse(req.body)
      const event = await scheduleService.updateEvent(eventId, orgId, body)
      return reply.send(event)
    }
  )

  // POST /organizations/:orgId/events/:eventId/publish — publica (LEADER+)
  app.post(
    '/:orgId/events/:eventId/publish',
    { preHandler: [app.authenticate, requireRole('LEADER')] },
    async (req, reply) => {
      const { orgId, eventId } = req.params as { orgId: string; eventId: string }
      const event = await scheduleService.publishEvent(eventId, orgId)
      return reply.send(event)
    }
  )

  // POST /organizations/:orgId/events/:eventId/slots — adiciona membro à escala
  app.post(
    '/:orgId/events/:eventId/slots',
    { preHandler: [app.authenticate, requireRole('LEADER')] },
    async (req, reply) => {
      const { orgId, eventId } = req.params as { orgId: string; eventId: string }
      const body = AddSlotBody.parse(req.body)
      const slot = await scheduleService.addSlot(eventId, orgId, body)
      return reply.status(201).send(slot)
    }
  )

  // DELETE /organizations/:orgId/events/:eventId/slots/:slotId
  app.delete(
    '/:orgId/events/:eventId/slots/:slotId',
    { preHandler: [app.authenticate, requireRole('LEADER')] },
    async (req, reply) => {
      const { orgId, slotId } = req.params as {
        orgId: string
        eventId: string
        slotId: string
      }
      await scheduleService.removeSlot(slotId, orgId)
      return reply.status(204).send()
    }
  )

  // PATCH /organizations/:orgId/attendances/:attendanceId — confirma presença (MEMBER)
  app.patch(
    '/:orgId/attendances/:attendanceId',
    { preHandler: [app.authenticate, requireRole('MEMBER')] },
    async (req, reply) => {
      const { orgId, attendanceId } = req.params as {
        orgId: string
        attendanceId: string
      }
      const body = ConfirmAttendanceBody.parse(req.body)
      const attendance = await scheduleService.confirmAttendance(
        attendanceId,
        req.orgMember.id,
        orgId,
        body
      )

      // broadcast via WebSocket pra sala do evento
      const io = app.io
      if (io) {
        io.to(`org:${orgId}`).emit('attendance:updated', attendance)
      }

      return reply.send(attendance)
    }
  )
}