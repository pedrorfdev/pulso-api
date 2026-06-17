import { PrismaClient } from '../../lib/prisma/generated/client.js'
import { NotFoundError, BadRequestError } from '../../shared/errors/app-error.js'
import type {
  CreateTechItemBody,
  AssignItemBody,
  UpdateAssignmentBody,
  TechItemResponse,
} from './tech-check.schema.js'

export class TechCheckService {
  constructor(private db: PrismaClient) {}

  async listItems(eventId: string, orgId: string): Promise<TechItemResponse[]> {
    const items = await this.db.techCheckItem.findMany({
      where: { event_id: eventId, organization_id: orgId },
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
      include: {
        assignments: {
          include: {
            member: {
              include: { user: { select: { name: true, avatar_url: true } } },
            },
          },
        },
      },
    })
    return items.map(this.toResponse)
  }

  async createItem(
    eventId: string,
    orgId: string,
    createdBy: string,
    data: CreateTechItemBody
  ): Promise<TechItemResponse> {
    const event = await this.db.event.findFirst({ where: { id: eventId, organization_id: orgId } })
    if (!event) throw new NotFoundError('Event')

    const item = await this.db.techCheckItem.create({
      data: {
        event_id: eventId,
        organization_id: orgId,
        created_by: createdBy,
        label: data.label,
        category: data.category,
        is_critical: data.is_critical,
      },
      include: { assignments: { include: { member: { include: { user: { select: { name: true, avatar_url: true } } } } } } },
    })
    return this.toResponse(item)
  }

  async deleteItem(itemId: string, orgId: string): Promise<void> {
    const item = await this.db.techCheckItem.findFirst({ where: { id: itemId, organization_id: orgId } })
    if (!item) throw new NotFoundError('Tech check item')
    await this.db.techCheckItem.delete({ where: { id: itemId } })
  }

  async assignMember(
    itemId: string,
    orgId: string,
    data: AssignItemBody
  ): Promise<TechItemResponse> {
    const item = await this.db.techCheckItem.findFirst({ where: { id: itemId, organization_id: orgId } })
    if (!item) throw new NotFoundError('Tech check item')

    const member = await this.db.organizationMember.findFirst({
      where: { user_id: data.member_id, organization_id: orgId, is_active: true },
    })
    if (!member) throw new NotFoundError('Member')

    await this.db.techCheckAssignment.upsert({
      where: { item_id_member_id: { item_id: itemId, member_id: member.id } },
      update: {},
      create: { item_id: itemId, member_id: member.id, status: 'PENDING' },
    })

    return this.getItem(itemId, orgId)
  }

  async updateAssignment(
    assignmentId: string,
    memberId: string,
    orgId: string,
    data: UpdateAssignmentBody
  ): Promise<TechItemResponse> {
    const assignment = await this.db.techCheckAssignment.findFirst({
      where: {
        id: assignmentId,
        member_id: memberId,
        item: { organization_id: orgId },
      },
    })
    if (!assignment) throw new NotFoundError('Assignment')

    await this.db.techCheckAssignment.update({
      where: { id: assignmentId },
      data: {
        status: data.status,
        checked_at: data.status === 'CHECKED' ? new Date() : null,
      },
    })

    return this.getItem(assignment.item_id, orgId)
  }

  // ── helpers privados

  private async getItem(itemId: string, orgId: string): Promise<TechItemResponse> {
    const item = await this.db.techCheckItem.findFirstOrThrow({
      where: { id: itemId, organization_id: orgId },
      include: {
        assignments: {
          include: {
            member: { include: { user: { select: { name: true, avatar_url: true } } } },
          },
        },
      },
    })
    return this.toResponse(item)
  }

  private toResponse(item: any): TechItemResponse {
    return {
      id: item.id,
      label: item.label,
      category: item.category,
      is_critical: item.is_critical,
      assignments: item.assignments.map((a: any) => ({
        id: a.id,
        status: a.status,
        checked_at: a.checked_at,
        member: { id: a.member.id, user: a.member.user },
      })),
    }
  }
}