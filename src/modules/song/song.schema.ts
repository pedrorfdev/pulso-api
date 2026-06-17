import { z } from 'zod'

export const CreateSongBody = z.object({
  title: z.string().min(1).max(100),
  artist: z.string().max(100).optional(),
  link_type: z.enum(['SPOTIFY', 'YOUTUBE', 'NONE']).default('NONE'),
  link_url: z.string().url().optional(),
  thumbnail_url: z.string().url().optional(),
})
export type CreateSongBody = z.infer<typeof CreateSongBody>

export const AddEventSongBody = z.object({
  song_id: z.string().uuid(),
  order: z.number().int().min(1),
  notes: z.string().max(200).optional(),
})
export type AddEventSongBody = z.infer<typeof AddEventSongBody>

export type SongResponse = {
  id: string
  title: string
  artist: string | null
  link_type: string
  link_url: string | null
  thumbnail_url: string | null
  added_by: { name: string }
  created_at: Date
}

export type EventSongResponse = {
  id: string
  order: number
  notes: string | null
  song: SongResponse
}