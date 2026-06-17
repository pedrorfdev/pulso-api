import { PrismaClient } from '../../lib/prisma/generated/client.js'
import { NotFoundError, ConflictError } from '../../shared/errors/app-error.js'
import type { CreateSongBody, AddEventSongBody, SongResponse, EventSongResponse } from './song.schema.js'

export class SongService {
  constructor(private db: PrismaClient) {}

  async listOrgSongs(orgId: string): Promise<SongResponse[]> {
    const songs = await this.db.song.findMany({
      where: { organization_id: orgId },
      orderBy: { title: 'asc' },
      include: {
        added_by_user: { select: { name: true } },
      },
    })
    return songs.map(this.toResponse)
  }

  async createSong(orgId: string, userId: string, data: CreateSongBody): Promise<SongResponse> {
    const song = await this.db.song.create({
      data: {
        organization_id: orgId,
        added_by: userId,
        title: data.title,
        artist: data.artist,
        link_type: data.link_type,
        link_url: data.link_url,
        thumbnail_url: data.thumbnail_url,
      },
      include: { added_by_user: { select: { name: true } } },
    })
    return this.toResponse(song)
  }

  async deleteSong(songId: string, orgId: string): Promise<void> {
    const song = await this.db.song.findFirst({ where: { id: songId, organization_id: orgId } })
    if (!song) throw new NotFoundError('Song')
    await this.db.song.delete({ where: { id: songId } })
  }

  async listEventSongs(eventId: string, orgId: string): Promise<EventSongResponse[]> {
    const eventSongs = await this.db.eventSong.findMany({
      where: { event: { id: eventId, organization_id: orgId } },
      orderBy: { order: 'asc' },
      include: {
        song: { include: { added_by_user: { select: { name: true } } } },
      },
    })
    return eventSongs.map((es) => ({
      id: es.id,
      order: es.order,
      notes: es.notes,
      song: this.toResponse(es.song),
    }))
  }

  async addSongToEvent(
    eventId: string,
    orgId: string,
    data: AddEventSongBody
  ): Promise<EventSongResponse> {
    const event = await this.db.event.findFirst({ where: { id: eventId, organization_id: orgId } })
    if (!event) throw new NotFoundError('Event')

    const song = await this.db.song.findFirst({ where: { id: data.song_id, organization_id: orgId } })
    if (!song) throw new NotFoundError('Song')

    const existing = await this.db.eventSong.findUnique({
      where: { event_id_song_id: { event_id: eventId, song_id: data.song_id } },
    })
    if (existing) throw new ConflictError('Louvor já adicionado a este evento')

    const eventSong = await this.db.eventSong.create({
      data: { event_id: eventId, song_id: data.song_id, order: data.order, notes: data.notes },
      include: { song: { include: { added_by_user: { select: { name: true } } } } },
    })

    return { id: eventSong.id, order: eventSong.order, notes: eventSong.notes, song: this.toResponse(eventSong.song) }
  }

  async removeSongFromEvent(eventSongId: string, orgId: string): Promise<void> {
    const eventSong = await this.db.eventSong.findFirst({
      where: { id: eventSongId, event: { organization_id: orgId } },
    })
    if (!eventSong) throw new NotFoundError('Event song')
    await this.db.eventSong.delete({ where: { id: eventSongId } })
  }

  private toResponse(song: any): SongResponse {
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      link_type: song.link_type,
      link_url: song.link_url,
      thumbnail_url: song.thumbnail_url,
      added_by: song.added_by_user,
      created_at: song.created_at,
    }
  }
}