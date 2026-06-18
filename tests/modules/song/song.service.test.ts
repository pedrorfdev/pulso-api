import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../../src/lib/prisma.js'
import { SongService } from '../../../src/modules/song/song.service.js'
import { ConflictError, NotFoundError } from '../../../src/shared/errors/app-error.js'

const songService = new SongService(prisma)

async function setup() {
  const user = await prisma.user.create({
    data: { name: 'Leader', email: `song${Date.now()}@pulso.app`, google_id: `gs${Date.now()}` },
  })
  const org = await prisma.organization.create({
    data: {
      name: 'Song Org',
      slug: `song-org-${Date.now()}`,
      created_by: user.id,
      confirmation_deadline_hours: 48,
    },
  })
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const event = await prisma.event.create({
    data: {
      organization_id: org.id,
      created_by: user.id,
      title: 'Culto',
      starts_at: startsAt,
      confirmation_deadline: new Date(startsAt.getTime() - 48 * 60 * 60 * 1000),
      is_published: true,
    },
  })
  return { user, org, event }
}

describe('SongService', () => {
  beforeEach(async () => {
    await prisma.memberStats.deleteMany()
    await prisma.techCheckAssignment.deleteMany()
    await prisma.techCheckItem.deleteMany()
    await prisma.eventSong.deleteMany()
    await prisma.song.deleteMany()
    await prisma.swapRequest.deleteMany()
    await prisma.attendance.deleteMany()
    await prisma.scheduleSlot.deleteMany()
    await prisma.event.deleteMany()
    await prisma.inviteLink.deleteMany()
    await prisma.organizationMember.deleteMany()
    await prisma.organization.deleteMany()
    await prisma.user.deleteMany()
  })

  describe('createSong', () => {
    it('deve criar um louvor na biblioteca da org', async () => {
      const { user, org } = await setup()

      const song = await songService.createSong(org.id, user.id, {
        title: 'Oceanos',
        artist: 'Hillsong',
        link_type: 'YOUTUBE',
        link_url: 'https://youtube.com/watch?v=abc',
      })

      expect(song.title).toBe('Oceanos')
      expect(song.artist).toBe('Hillsong')
      expect(song.link_type).toBe('YOUTUBE')
    })
  })

  describe('listOrgSongs', () => {
    it('deve listar louvores da org em ordem alfabética', async () => {
      const { user, org } = await setup()

      await songService.createSong(org.id, user.id, { title: 'Teu Reino', link_type: 'NONE' })
      await songService.createSong(org.id, user.id, { title: 'Oceanos', link_type: 'NONE' })

      const songs = await songService.listOrgSongs(org.id)

      expect(songs[0].title).toBe('Oceanos')
      expect(songs[1].title).toBe('Teu Reino')
    })
  })

  describe('addSongToEvent / listEventSongs', () => {
    it('deve adicionar louvor ao evento e listar em ordem', async () => {
      const { user, org, event } = await setup()

      const song1 = await songService.createSong(org.id, user.id, { title: 'Nada Além', link_type: 'NONE' })
      const song2 = await songService.createSong(org.id, user.id, { title: 'Oceanos', link_type: 'NONE' })

      await songService.addSongToEvent(event.id, org.id, { song_id: song1.id, order: 2 })
      await songService.addSongToEvent(event.id, org.id, { song_id: song2.id, order: 1 })

      const eventSongs = await songService.listEventSongs(event.id, org.id)

      expect(eventSongs).toHaveLength(2)
      expect(eventSongs[0].song.title).toBe('Oceanos') // order 1
      expect(eventSongs[1].song.title).toBe('Nada Além') // order 2
    })

    it('deve lançar ConflictError ao adicionar louvor duplicado', async () => {
      const { user, org, event } = await setup()

      const song = await songService.createSong(org.id, user.id, { title: 'Oceanos', link_type: 'NONE' })
      await songService.addSongToEvent(event.id, org.id, { song_id: song.id, order: 1 })

      await expect(
        songService.addSongToEvent(event.id, org.id, { song_id: song.id, order: 2 })
      ).rejects.toThrow(ConflictError)
    })
  })

  describe('removeSongFromEvent', () => {
    it('deve remover louvor do evento', async () => {
      const { user, org, event } = await setup()

      const song = await songService.createSong(org.id, user.id, { title: 'Oceanos', link_type: 'NONE' })
      const eventSong = await songService.addSongToEvent(event.id, org.id, { song_id: song.id, order: 1 })

      await songService.removeSongFromEvent(eventSong.id, org.id)

      const songs = await songService.listEventSongs(event.id, org.id)
      expect(songs).toHaveLength(0)
    })
  })

  describe('deleteSong', () => {
    it('deve lançar NotFoundError ao deletar louvor inexistente', async () => {
      const { org } = await setup()

      await expect(
        songService.deleteSong('00000000-0000-0000-0000-000000000000', org.id)
      ).rejects.toThrow(NotFoundError)
    })
  })
})