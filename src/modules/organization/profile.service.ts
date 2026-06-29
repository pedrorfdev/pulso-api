import { PrismaClient } from "../../lib/prisma/generated/client.js";
import {
  NotFoundError,
  ForbiddenError,
} from "../../shared/errors/app-error.js";
import type {
  UpdateProfileBody,
  MemberProfileResponse,
  AttendanceHistoryEntry,
} from "./profile.schema.js";

export class ProfileService {
  constructor(private db: PrismaClient) {}

  // retorna o perfil completo de um membro
  // se showJustifications = false (config da org), oculta justificativas de DECLINED
  async getMemberProfile(
    targetMemberId: string,
    orgId: string,
    requestingMemberId: string,
    isLeader: boolean,
  ): Promise<MemberProfileResponse> {
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { justifications_public: true },
    });

    const member = await this.db.organizationMember.findFirst({
      where: { id: targetMemberId, organization_id: orgId, is_active: true },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar_url: true },
        },
        stats: true,
        slots: {
          include: {
            event: {
              select: {
                id: true,
                title: true,
                location: true,
                starts_at: true,
              },
            },
            attendance: {
              select: { status: true, justification: true, responded_at: true },
            },
          },
          orderBy: { event: { starts_at: "desc" } },
        },
      },
    });

    if (!member) throw new NotFoundError("Member");

    const isSelf = targetMemberId === requestingMemberId;
    const canSeeOthersJustifications = isLeader || org.justifications_public;
    const canSeeJustifications = isSelf || canSeeOthersJustifications;

    // busca swaps vinculados a cada slot
    const slotIds = member.slots.map((s) => s.id);
    const swaps = await this.db.swapRequest.findMany({
      where: {
        organization_id: orgId,
        OR: [
          { requester_slot_id: { in: slotIds } },
          { target_slot_id: { in: slotIds } },
        ],
      },
      select: {
        id: true,
        status: true,
        requester_slot_id: true,
        target_slot_id: true,
      },
    });

    const history: AttendanceHistoryEntry[] = member.slots.map((slot) => {
      const swap = swaps.find(
        (sw) =>
          sw.requester_slot_id === slot.id || sw.target_slot_id === slot.id,
      );

      const attendance = slot.attendance
        ? {
            status: slot.attendance.status,
            justification: canSeeJustifications
              ? slot.attendance.justification
              : null,
            responded_at: slot.attendance.responded_at,
          }
        : null;

      return {
        event: slot.event,
        role_labels: slot.role_labels,
        attendance,
        swap: swap
          ? {
              id: swap.id,
              status: swap.status,
              was_requester: swap.requester_slot_id === slot.id,
            }
          : null,
      };
    });

    return {
      member_id: member.id,
      role: member.role,
      nickname: member.nickname,
      joined_at: member.joined_at,
      user: member.user,
      stats: member.stats
        ? {
            confirmed_on_time: member.stats.confirmed_on_time,
            confirmed_late: member.stats.confirmed_late,
            absences: member.stats.absences,
            deadline_misses: member.stats.deadline_misses,
            swaps_requested: member.stats.swaps_requested,
            swaps_accepted: member.stats.swaps_accepted,
            reliability_score: member.stats.reliability_score,
          }
        : null,
      history,
    };
  }

  // membro pode mudar o próprio nickname
  async updateProfile(
    memberId: string,
    orgId: string,
    data: UpdateProfileBody,
  ): Promise<{ nickname: string | null }> {
    const member = await this.db.organizationMember.findFirst({
      where: { id: memberId, organization_id: orgId, is_active: true },
    });
    if (!member) throw new NotFoundError("Member");

    const updated = await this.db.organizationMember.update({
      where: { id: memberId },
      data: { nickname: data.nickname },
      select: { nickname: true },
    });

    return { nickname: updated.nickname };
  }

  // lista TODOS os eventos da org com detalhes completos (para a tela de histórico geral)
  async listEventHistory(orgId: string, isLeader: boolean) {
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { justifications_public: true },
    });

    const events = await this.db.event.findMany({
      where: { organization_id: orgId, is_published: true },
      orderBy: { starts_at: "desc" },
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
        tech_items: {
          include: {
            assignments: {
              include: {
                member: { include: { user: { select: { name: true } } } },
              },
            },
          },
        },
        songs: {
          orderBy: { order: "asc" },
          include: {
            song: {
              select: {
                title: true,
                artist: true,
                link_type: true,
                link_url: true,
              },
            },
          },
        },
      },
    });

    // no histórico geral, justificativas individuais seguem a config da org
    // (lider sempre vê, membros só veem se justifications_public = true)
    const canSeeJustifications = isLeader || org.justifications_public;

    return events.map((event) => ({
      id: event.id,
      title: event.title,
      location: event.location,
      starts_at: event.starts_at,
      confirmation_deadline: event.confirmation_deadline,
      slots: event.slots.map((slot) => ({
        id: slot.id,
        role_labels: slot.role_labels,
        member: {
          id: slot.member.id,
          user: slot.member.user,
          role: slot.member.role,
        },
        attendance: slot.attendance
          ? {
              status: slot.attendance.status,
              justification: canSeeJustifications
                ? slot.attendance.justification
                : null,
              responded_at: slot.attendance.responded_at,
            }
          : null,
      })),
      songs: event.songs.map((es) => ({
        order: es.order,
        notes: es.notes,
        ...es.song,
      })),
      tech_check: event.tech_items.map((item) => ({
        id: item.id,
        label: item.label,
        category: item.category,
        is_critical: item.is_critical,
        assignments: item.assignments.map((a) => ({
          status: a.status,
          checked_at: a.checked_at,
          member_name: a.member.user.name,
        })),
      })),
    }));
  }
}
