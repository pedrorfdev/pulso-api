import { PrismaClient } from '../../lib/prisma/generated/client.js'
import { BadRequestError, NotFoundError, ForbiddenError } from '../../shared/errors/app-error.js'
import type {
  CreateEventBody,
  UpdateEventBody,
  AddSlotBody,
  ConfirmAttendanceBody,
  EventResponse,
  EventSummaryResponse,
  SlotResponse,
} from './schedule.schema.js'

export class ScheduleService {
  constructor(private db: PrismaClient) {}

  async createEvent(
    orgId: string,
    createdBy: string,
    data: CreateEventBody
  ): Promise<EventResponse> {
    const org = await this.db.organization.findUnique({
      where: { id: orgId },
      select: { confirmation_deadline_hours: true },
    })

    if (!org) throw new NotFoundError('Organization')

    const startsAt = new Date(data.starts_at)
    const confirmationDeadline = new Date(
      startsAt.getTime() - org.confirmation_deadline_hours * 60 * 60 * 1000
    )

    if (confirmationDeadline < new Date()) {
      throw new BadRequestError(
        'Data do evento muito próxima — prazo de confirmação já teria passado'
      )
    }

    const event = await this.db.event.create({
      data: {
        organization_id: orgId,
        created_by: createdBy,
        title: data.title,
        description: data.description,
        location: data.location,
        starts_at: startsAt,
        confirmation_deadline: confirmationDeadline,
      },
      include: { slots: false },
    })

    return this.toEventResponse({ ...event, slots: [] })
  }

  async updateEvent(
    eventId: string,
    orgId: string,
    data: UpdateEventBody
  ): Promise<EventResponse> {
    const event = await this.findEventInOrg(eventId, orgId)

    if (event.is_published) {
      throw new BadRequestError('Não é possível editar um evento já publicado')
    }

    const updateData: Record<string, unknown> = { ...data }

    if (data.starts_at) {
      const org = await this.db.organization.findUnique({
        where: { id: orgId },
        select: { confirmation_deadline_hours: true },
      })
      const startsAt = new Date(data.starts_at)
      updateData.starts_at = startsAt
      updateData.confirmation_deadline = new Date(
        startsAt.getTime() - org!.confirmation_deadline_hours * 60 * 60 * 1000
      )
    }

    const updated = await this.db.event.update({
      where: { id: eventId },
      data: updateData,
    })

    return this.toEventResponse({ ...updated, slots: [] })
  }

  async publishEvent(
    eventId: string,
    orgId: string
  ): Promise<EventResponse> {
    const event = await this.findEventInOrg(eventId, orgId)

    if (event.is_published) {
      throw new BadRequestError('Evento já está publicado')
    }

    const slots = await this.db.scheduleSlot.findMany({
      where: { event_id: eventId },
    })

    if (slots.length === 0) {
      throw new BadRequestError('Adicione ao menos um membro antes de publicar')
    }

    const published = await this.db.event.update({
      where: { id: eventId },
      data: { is_published: true },
      include: {
        slots: {
          include: {
            member: { include: { user: { select: { id: true, name: true, avatar_url: true } } } },
            attendance: true,
          },
        },
      },
    })

    return this.toEventResponse(published)
  }

  async listEvents(
    orgId: string,
    memberId: string
  ): Promise<EventSummaryResponse[]> {
    const events = await this.db.event.findMany({
      where: { organization_id: orgId, is_published: true },
      orderBy: { starts_at: 'asc' },
      include: {
        slots: {
          include: { attendance: true },
        },
      },
    })

    return events.map((event) => {
      const mySlot = event.slots.find((s) => s.member_id === memberId)
      const confirmed = event.slots.filter(
        (s) => s.attendance?.status === 'CONFIRMED'
      ).length
      const pending = event.slots.filter(
        (s) => s.attendance?.status === 'PENDING'
      ).length

      return {
        id: event.id,
        title: event.title,
        location: event.location,
        starts_at: event.starts_at,
        confirmation_deadline: event.confirmation_deadline,
        is_published: event.is_published,
        confirmed_count: confirmed,
        pending_count: pending,
        total_slots: event.slots.length,
        my_attendance_status: mySlot?.attendance?.status ?? null,
      }
    })
  }

  async getEvent(eventId: string, orgId: string): Promise<EventResponse> {
    const event = await this.db.event.findFirst({
      where: { id: eventId, organization_id: orgId },
      include: {
        slots: {
          include: {
            member: {
              include: {
                user: { select: { id: true, name: true, avatar_url: true } },
              },
            },
            attendance: true,
          },
        },
      },
    })

    if (!event) throw new NotFoundError('Event')

    return this.toEventResponse(event)
  }

  async addSlot(
    eventId: string,
    orgId: string,
    data: AddSlotBody
  ): Promise<SlotResponse> {
    const event = await this.findEventInOrg(eventId, orgId)

    if (event.is_published) {
      throw new BadRequestError('Não é possível alterar escala de evento publicado')
    }

    // verifica se o membro pertence à org
    const member = await this.db.organizationMember.findUnique({
      where: {
        user_id_organization_id: {
          user_id: data.member_id,
          organization_id: orgId,
        },
      },
    })

    if (!member || !member.is_active) {
      throw new NotFoundError('Member')
    }

    // cria slot + attendance atomicamente
    const slot = await this.db.scheduleSlot.create({
      data: {
        event_id: eventId,
        member_id: member.id,
        role_label: data.role_label,
        notes: data.notes,
        attendance: {
          create: {
            member_id: member.id,
            status: 'PENDING',
          },
        },
      },
      include: {
        member: {
          include: {
            user: { select: { id: true, name: true, avatar_url: true } },
          },
        },
        attendance: true,
      },
    })

    return this.toSlotResponse(slot)
  }

  async removeSlot(slotId: string, orgId: string): Promise<void> {
    const slot = await this.db.scheduleSlot.findFirst({
      where: { id: slotId, event: { organization_id: orgId } },
      include: { event: true },
    })

    if (!slot) throw new NotFoundError('Slot')

    if (slot.event.is_published) {
      throw new BadRequestError('Não é possível remover slot de evento publicado')
    }

    await this.db.scheduleSlot.delete({ where: { id: slotId } })
  }

  async confirmAttendance(
    attendanceId: string,
    memberId: string,
    orgId: string,
    data: ConfirmAttendanceBody
  ): Promise<{ id: string; status: string; justification: string | null }> {
    const attendance = await this.db.attendance.findFirst({
      where: {
        id: attendanceId,
        member_id: memberId,
        slot: { event: { organization_id: orgId } },
      },
      include: {
        slot: { include: { event: true } },
      },
    })

    if (!attendance) throw new NotFoundError('Attendance')

    if (attendance.slot.event.confirmation_deadline < new Date()) {
      throw new BadRequestError('Prazo de confirmação encerrado')
    }

    if (
      attendance.status === 'CONFIRMED' ||
      attendance.status === 'DECLINED'
    ) {
      throw new BadRequestError('Presença já confirmada anteriormente')
    }

    const updated = await this.db.attendance.update({
      where: { id: attendanceId },
      data: {
        status: data.status,
        justification: data.justification ?? null,
        responded_at: new Date(),
      },
    })

    // atualiza stats do membro
    await this.updateMemberStats(memberId, data.status)

    return {
      id: updated.id,
      status: updated.status,
      justification: updated.justification,
    }
  }

  // ── helpers privados

  private async findEventInOrg(eventId: string, orgId: string) {
    const event = await this.db.event.findFirst({
      where: { id: eventId, organization_id: orgId },
    })
    if (!event) throw new NotFoundError('Event')
    return event
  }

  private async updateMemberStats(memberId: string, status: string) {
    await this.db.memberStats.upsert({
      where: { member_id: memberId },
      update: {
        confirmed_on_time: status === 'CONFIRMED' ? { increment: 1 } : undefined,
        absences: status === 'DECLINED' ? { increment: 1 } : undefined,
      },
      create: {
        member_id: memberId,
        confirmed_on_time: status === 'CONFIRMED' ? 1 : 0,
        absences: status === 'DECLINED' ? 1 : 0,
      },
    })
  }

  private toSlotResponse(slot: any): SlotResponse {
    return {
      id: slot.id,
      role_label: slot.role_label,
      notes: slot.notes,
      member: {
        id: slot.member.id,
        role: slot.member.role,
        nickname: slot.member.nickname,
        user: slot.member.user,
      },
      attendance: slot.attendance
        ? {
            id: slot.attendance.id,
            status: slot.attendance.status,
            justification: slot.attendance.justification,
            responded_at: slot.attendance.responded_at,
          }
        : null,
    }
  }

  private toEventResponse(event: any): EventResponse {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      starts_at: event.starts_at,
      confirmation_deadline: event.confirmation_deadline,
      is_published: event.is_published,
      created_at: event.created_at,
      slots: (event.slots ?? []).map((s: any) => this.toSlotResponse(s)),
    }
  }
}