import { z } from 'zod'

// ── inputs
export const CreateEventBody = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  starts_at: z.string().datetime(),
})
export type CreateEventBody = z.infer<typeof CreateEventBody>

export const UpdateEventBody = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  starts_at: z.string().datetime().optional(),
})
export type UpdateEventBody = z.infer<typeof UpdateEventBody>

export const AddSlotBody = z.object({
  member_id: z.string().uuid(),
  role_label: z.string().min(1).max(50),
  notes: z.string().max(200).optional(),
})
export type AddSlotBody = z.infer<typeof AddSlotBody>

export const ConfirmAttendanceBody = z.object({
  status: z.enum(['CONFIRMED', 'DECLINED']),
  justification: z.string().min(1).max(500).optional(),
}).refine(
  (data) => data.status === 'CONFIRMED' || !!data.justification,
  { message: 'Justificativa obrigatória ao declinar', path: ['justification'] }
)
export type ConfirmAttendanceBody = z.infer<typeof ConfirmAttendanceBody>

// ── response types
export type SlotResponse = {
  id: string
  role_label: string
  notes: string | null
  member: {
    id: string
    role: string
    nickname: string | null
    user: {
      id: string
      name: string
      avatar_url: string | null
    }
  }
  attendance: {
    id: string
    status: string
    justification: string | null
    responded_at: Date | null
  } | null
}

export type EventResponse = {
  id: string
  title: string
  description: string | null
  location: string | null
  starts_at: Date
  confirmation_deadline: Date
  is_published: boolean
  created_at: Date
  slots: SlotResponse[]
}

export type EventSummaryResponse = {
  id: string
  title: string
  location: string | null
  starts_at: Date
  confirmation_deadline: Date
  is_published: boolean
  confirmed_count: number
  pending_count: number
  total_slots: number
  my_attendance_status: string | null
}