import { z } from 'zod'

export const CreateSwapBody = z.object({
  target_slot_id: z.string().uuid(),
  message: z.string().max(300).optional(),
})
export type CreateSwapBody = z.infer<typeof CreateSwapBody>

export const ReviewSwapBody = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
  rejection_reason: z.string().max(300).optional(),
}).refine(
  (d) => d.action === 'ACCEPT' || !!d.rejection_reason,
  { message: 'Motivo obrigatório ao rejeitar', path: ['rejection_reason'] }
)
export type ReviewSwapBody = z.infer<typeof ReviewSwapBody>

export type SwapResponse = {
  id: string
  status: string
  message: string | null
  rejection_reason: string | null
  created_at: Date
  resolved_at: Date | null
  requester: {
    id: string
    role_label: string
    member: { id: string; user: { name: string; avatar_url: string | null } }
  }
  target: {
    id: string
    role_label: string
    member: { id: string; user: { name: string; avatar_url: string | null } }
  } | null
}