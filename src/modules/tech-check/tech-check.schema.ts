import { z } from 'zod'

export const CreateTechItemBody = z.object({
  label: z.string().min(1).max(100),
  category: z.string().max(50).optional(),
  is_critical: z.boolean().default(false),
})
export type CreateTechItemBody = z.infer<typeof CreateTechItemBody>

export const AssignItemBody = z.object({
  member_id: z.string().uuid(),
})
export type AssignItemBody = z.infer<typeof AssignItemBody>

export const UpdateAssignmentBody = z.object({
  status: z.enum(['PENDING', 'CHECKED', 'MISSING']),
})
export type UpdateAssignmentBody = z.infer<typeof UpdateAssignmentBody>

export type TechItemResponse = {
  id: string
  label: string
  category: string | null
  is_critical: boolean
  assignments: {
    id: string
    status: string
    checked_at: Date | null
    member: { id: string; user: { name: string; avatar_url: string | null } }
  }[]
}