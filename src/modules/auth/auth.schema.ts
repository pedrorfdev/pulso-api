import { z } from 'zod'

export const GoogleCallbackQuery = z.object({
  code: z.string(),
  state: z.string().optional(),
})
export type GoogleCallbackQuery = z.infer<typeof GoogleCallbackQuery>

export type AuthUserResponse = {
  id: string
  name: string
  email: string
  avatar_url: string | null
}

export type AuthResponse = {
  token: string
  user: AuthUserResponse
}