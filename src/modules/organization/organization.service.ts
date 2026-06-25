import { PrismaClient } from '../../lib/prisma/generated/client.js'
import { env } from '../../lib/env.js'
import { ConflictError, NotFoundError } from '../../shared/errors/app-error.js'
import type {
  CreateOrgBody,
  UpdateOrgBody,
  CreateInviteBody,
  OrgResponse,
  OrgMemberResponse,
  InviteLinkResponse,
  MyOrgMembershipResponse,
} from './organization.schema.js'

export class OrganizationService {
  constructor(private db: PrismaClient) {}

  // lista as orgs que o usuário logado pertence — usado pelo front
  // logo após o login pra montar o seletor/redirecionamento de org
  async listMyOrganizations(userId: string): Promise<MyOrgMembershipResponse[]> {
    const memberships = await this.db.organizationMember.findMany({
      where: { user_id: userId, is_active: true },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { joined_at: 'asc' },
    })

    return memberships.map((m) => ({
      member_id: m.id,
      role: m.role,
      nickname: m.nickname,
      joined_at: m.joined_at,
      organization: m.organization,
    }))
  }

  async create(userId: string, data: CreateOrgBody): Promise<OrgResponse> {
    const existing = await this.db.organization.findUnique({
      where: { slug: data.slug },
    })

    if (existing) {
      throw new ConflictError(`Slug "${data.slug}" já está em uso`)
    }

    const org = await this.db.organization.create({
      data: {
        ...data,
        created_by: userId,
        // quem cria já entra como ADMIN
        members: {
          create: {
            user_id: userId,
            role: 'ADMIN',
          },
        },
      },
    })

    return this.toResponse(org)
  }

  async findBySlug(slug: string): Promise<OrgResponse> {
    const org = await this.db.organization.findUnique({ where: { slug } })

    if (!org) throw new NotFoundError('Organization')

    return this.toResponse(org)
  }

  async update(orgId: string, data: UpdateOrgBody): Promise<OrgResponse> {
    const org = await this.db.organization.update({
      where: { id: orgId },
      data,
    })

    return this.toResponse(org)
  }

  async listMembers(orgId: string): Promise<OrgMemberResponse[]> {
    const members = await this.db.organizationMember.findMany({
      where: { organization_id: orgId, is_active: true },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar_url: true },
        },
      },
      orderBy: { joined_at: 'asc' },
    })

    return members.map((m) => ({
      id: m.id,
      role: m.role,
      nickname: m.nickname,
      joined_at: m.joined_at,
      user: m.user,
    }))
  }

  async createInviteLink(
    orgId: string,
    createdBy: string,
    data: CreateInviteBody
  ): Promise<InviteLinkResponse> {
    const expiresAt = data.expires_in_hours
      ? new Date(Date.now() + data.expires_in_hours * 60 * 60 * 1000)
      : null

    const invite = await this.db.inviteLink.create({
      data: {
        organization_id: orgId,
        created_by: createdBy,
        role_to_assign: data.role_to_assign,
        expires_at: expiresAt,
        max_uses: data.max_uses,
      },
    })

    return this.toInviteResponse(invite)
  }

  async joinByInvite(userId: string, token: string): Promise<OrgMemberResponse> {
    const invite = await this.db.inviteLink.findUnique({ where: { token } })

    if (!invite) throw new NotFoundError('Invite link')

    if (invite.expires_at && invite.expires_at < new Date()) {
      throw new ConflictError('Este link de convite expirou')
    }

    if (invite.max_uses && invite.uses_count >= invite.max_uses) {
      throw new ConflictError('Este link de convite atingiu o limite de usos')
    }

    // verifica se já é membro
    const existing = await this.db.organizationMember.findUnique({
      where: {
        user_id_organization_id: {
          user_id: userId,
          organization_id: invite.organization_id,
        },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar_url: true },
        },
      },
    })

    if (existing?.is_active) {
      return {
        id: existing.id,
        role: existing.role,
        nickname: existing.nickname,
        joined_at: existing.joined_at,
        user: existing.user,
      }
    }

    // transação: cria membro + incrementa uses_count + cria stats
    const [member] = await this.db.$transaction([
      this.db.organizationMember.upsert({
        where: {
          user_id_organization_id: {
            user_id: userId,
            organization_id: invite.organization_id,
          },
        },
        update: { role: invite.role_to_assign, is_active: true },
        create: {
          user_id: userId,
          organization_id: invite.organization_id,
          role: invite.role_to_assign,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar_url: true },
          },
        },
      }),
      this.db.inviteLink.update({
        where: { id: invite.id },
        data: { uses_count: { increment: 1 } },
      }),
    ])

    // cria stats se não existir
    await this.db.memberStats.upsert({
      where: { member_id: member.id },
      update: {},
      create: { member_id: member.id },
    })

    return {
      id: member.id,
      role: member.role,
      nickname: member.nickname,
      joined_at: member.joined_at,
      user: member.user,
    }
  }

  // ── helpers privados
  private toResponse(org: {
    id: string
    name: string
    slug: string
    description: string | null
    confirmation_deadline_hours: number
    absences_public: boolean
    justifications_public: boolean
    created_at: Date
  }): OrgResponse {
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      description: org.description,
      confirmation_deadline_hours: org.confirmation_deadline_hours,
      absences_public: org.absences_public,
      justifications_public: org.justifications_public,
      created_at: org.created_at,
    }
  }

  private toInviteResponse(invite: {
    id: string
    token: string
    role_to_assign: string
    expires_at: Date | null
    max_uses: number | null
    uses_count: number
  }): InviteLinkResponse {
    return {
      id: invite.id,
      token: invite.token,
      role_to_assign: invite.role_to_assign,
      expires_at: invite.expires_at,
      max_uses: invite.max_uses,
      uses_count: invite.uses_count,
      invite_url: `${env.FRONTEND_URL}/join/${invite.token}`,
    }
  }
}