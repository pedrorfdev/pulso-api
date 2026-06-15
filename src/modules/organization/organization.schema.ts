import { z } from 'zod'

// ── inputs
export const CreateOrgBody = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  description: z.string().max(300).optional(),
  confirmation_deadline_hours: z.number().int().min(1).max(168).default(48),
})
export type CreateOrgBody = z.infer<typeof CreateOrgBody>

export const UpdateOrgBody = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(300).optional(),
  confirmation_deadline_hours: z.number().int().min(1).max(168).optional(),
  absences_public: z.boolean().optional(),
  justifications_public: z.boolean().optional(),
})
export type UpdateOrgBody = z.infer<typeof UpdateOrgBody>

export const CreateInviteBody = z.object({
  role_to_assign: z.enum(['ADMIN', 'LEADER', 'MEMBER']).default('MEMBER'),
  expires_in_hours: z.number().int().min(1).max(720).optional(), // max 30 dias
  max_uses: z.number().int().min(1).optional(),
})
export type CreateInviteBody = z.infer<typeof CreateInviteBody>

// ── response types
export type OrgResponse = {
  id: string
  name: string
  slug: string
  description: string | null
  confirmation_deadline_hours: number
  absences_public: boolean
  justifications_public: boolean
  created_at: Date
}

export type OrgMemberResponse = {
  id: string
  role: string
  nickname: string | null
  joined_at: Date
  user: {
    id: string
    name: string
    email: string
    avatar_url: string | null
  }
}

export type InviteLinkResponse = {
  id: string
  token: string
  role_to_assign: string
  expires_at: Date | null
  max_uses: number | null
  uses_count: number
  invite_url: string
}