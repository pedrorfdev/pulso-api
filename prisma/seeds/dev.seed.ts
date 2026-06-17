import 'dotenv/config'
import { PrismaClient } from '../../src/lib/prisma/generated/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function seedDev() {
  console.log('🌱 Seeding dev data...')

  // ── organização real
  const org = await prisma.organization.upsert({
    where: { slug: 'jovens-conexao' },
    update: {},
    create: {
      name: 'Jovens Conexão',
      slug: 'jovens-conexao',
      description: 'Ministério de louvor dos jovens',
      confirmation_deadline_hours: 48,
      absences_public: true,
      justifications_public: false,
      created_by: 'seed', // substituído abaixo
    },
  })

  // ── usuários
  const pedro = await prisma.user.upsert({
    where: { email: 'pedro@pulso.app' },
    update: {},
    create: {
      name: 'Pedro Falcão',
      email: 'pedro@pulso.app',
      google_id: 'google_pedro_dev',
      avatar_url: null,
    },
  })

  const lucas = await prisma.user.upsert({
    where: { email: 'lucas@pulso.app' },
    update: {},
    create: {
      name: 'Lucas Moura',
      email: 'lucas@pulso.app',
      google_id: 'google_lucas_dev',
    },
  })

  const ana = await prisma.user.upsert({
    where: { email: 'ana@pulso.app' },
    update: {},
    create: {
      name: 'Ana Silva',
      email: 'ana@pulso.app',
      google_id: 'google_ana_dev',
    },
  })

  const joao = await prisma.user.upsert({
    where: { email: 'joao@pulso.app' },
    update: {},
    create: {
      name: 'João Pereira',
      email: 'joao@pulso.app',
      google_id: 'google_joao_dev',
    },
  })

  // atualiza created_by da org pro pedro
  await prisma.organization.update({
    where: { id: org.id },
    data: { created_by: pedro.id },
  })

  // ── membros
  const upsertMember = async (userId: string, role: 'ADMIN' | 'LEADER' | 'MEMBER') => {
    const member = await prisma.organizationMember.upsert({
      where: { user_id_organization_id: { user_id: userId, organization_id: org.id } },
      update: {},
      create: { user_id: userId, organization_id: org.id, role },
    })
    await prisma.memberStats.upsert({
      where: { member_id: member.id },
      update: {},
      create: { member_id: member.id },
    })
    return member
  }

  const memberPedro = await upsertMember(pedro.id, 'ADMIN')
  const memberLucas = await upsertMember(lucas.id, 'LEADER')
  const memberAna = await upsertMember(ana.id, 'MEMBER')
  const memberJoao = await upsertMember(joao.id, 'MEMBER')

  // ── link de convite ativo
  await prisma.inviteLink.upsert({
    where: { token: 'dev-invite-token' },
    update: {},
    create: {
      organization_id: org.id,
      created_by: pedro.id,
      token: 'dev-invite-token',
      role_to_assign: 'MEMBER',
    },
  })

  // ── evento próximo (publicado)
  const nextSunday = new Date()
  nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()))
  nextSunday.setHours(18, 0, 0, 0)

  const event = await prisma.event.upsert({
    where: { id: 'dev-event-001' },
    update: {},
    create: {
      id: 'dev-event-001',
      organization_id: org.id,
      created_by: pedro.id,
      title: 'Culto de Domingo',
      location: 'Templo Principal',
      starts_at: nextSunday,
      confirmation_deadline: new Date(nextSunday.getTime() - 48 * 60 * 60 * 1000),
      is_published: true,
    },
  })

  // ── slots + attendances
  const addSlot = async (memberId: string, roleLabel: string, status: 'PENDING' | 'CONFIRMED' | 'DECLINED') => {
    const slot = await prisma.scheduleSlot.upsert({
      where: { event_id_member_id: { event_id: event.id, member_id: memberId } },
      update: {},
      create: { event_id: event.id, member_id: memberId, role_label: roleLabel },
    })
    await prisma.attendance.upsert({
      where: { slot_id: slot.id },
      update: {},
      create: {
        slot_id: slot.id,
        member_id: memberId,
        status,
        responded_at: status !== 'PENDING' ? new Date() : null,
        justification: status === 'DECLINED' ? 'Viagem de família' : null,
      },
    })
    return slot
  }

  await addSlot(memberPedro.id, 'Violão elétrico', 'CONFIRMED')
  await addSlot(memberLucas.id, 'Baixo elétrico', 'PENDING')
  await addSlot(memberAna.id, 'Teclado', 'CONFIRMED')
  await addSlot(memberJoao.id, 'Bateria', 'DECLINED')

  // ── louvores
  const songs = [
    { title: 'Nada Além do Sangue', artist: 'Fernandinho' },
    { title: 'Oceanos', artist: 'Hillsong / Gabriela Rocha' },
    { title: 'Teu Reino', artist: 'Gabriela Rocha' },
  ]

  for (const [i, song] of songs.entries()) {
    const created = await prisma.song.upsert({
      where: { id: `dev-song-00${i + 1}` },
      update: {},
      create: {
        id: `dev-song-00${i + 1}`,
        organization_id: org.id,
        title: song.title,
        artist: song.artist,
        link_type: 'NONE',
        added_by: pedro.id,
      },
    })
    await prisma.eventSong.upsert({
      where: { event_id_song_id: { event_id: event.id, song_id: created.id } },
      update: {},
      create: { event_id: event.id, song_id: created.id, order: i + 1 },
    })
  }

  console.log(`
✅ Dev seed concluído!

Org:    Jovens Conexão (slug: jovens-conexao)
Users:  pedro@pulso.app (ADMIN)
        lucas@pulso.app (LEADER)
        ana@pulso.app   (MEMBER)
        joao@pulso.app  (MEMBER)
Invite: http://localhost:5173/invite/dev-invite-token
Evento: Culto de Domingo — ${nextSunday.toLocaleDateString('pt-BR')}
  `)
}

seedDev()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })