import 'dotenv/config'
import { PrismaClient } from '../../src/lib/prisma/generated/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function seedDemo() {
  console.log('🌱 Seeding demo org...')

  // ── garante que a org demo existe
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-pulso' },
    update: {},
    create: {
      name: 'Demo Pulso',
      slug: 'demo-pulso',
      description: 'Organização de demonstração do Pulso',
      confirmation_deadline_hours: 48,
      absences_public: true,
      justifications_public: false,
      created_by: 'seed-placeholder', // substituído abaixo
    },
  })

  // ── limpa APENAS dados da org demo (nunca toca em outras orgs)
  await prisma.notification.deleteMany({ where: { organization_id: org.id } })
  await prisma.memberStats.deleteMany({
    where: { member: { organization_id: org.id } },
  })
  await prisma.techCheckAssignment.deleteMany({
    where: { item: { organization_id: org.id } },
  })
  await prisma.techCheckItem.deleteMany({ where: { organization_id: org.id } })
  await prisma.eventSong.deleteMany({
    where: { event: { organization_id: org.id } },
  })
  await prisma.swapRequest.deleteMany({ where: { organization_id: org.id } })
  await prisma.attendance.deleteMany({
    where: { slot: { event: { organization_id: org.id } } },
  })
  await prisma.scheduleSlot.deleteMany({
    where: { event: { organization_id: org.id } },
  })
  await prisma.event.deleteMany({ where: { organization_id: org.id } })
  await prisma.song.deleteMany({ where: { organization_id: org.id } })
  await prisma.inviteLink.deleteMany({ where: { organization_id: org.id } })
  await prisma.organizationMember.deleteMany({ where: { organization_id: org.id } })

  console.log('🧹 Demo org limpa')

  // ── usuários demo
  const createUser = async (name: string, email: string, googleId: string) =>
    prisma.user.upsert({
      where: { email },
      update: { name },
      create: { name, email, google_id: googleId },
    })

  const admin   = await createUser('Ana Demo (Admin)',  'demo.admin@pulso.app',  'demo_admin')
  const leader  = await createUser('Bruno Demo (Líder)', 'demo.leader@pulso.app', 'demo_leader')
  const member1 = await createUser('Carla Demo',        'demo.carla@pulso.app',  'demo_carla')
  const member2 = await createUser('Diego Demo',        'demo.diego@pulso.app',  'demo_diego')
  const member3 = await createUser('Elena Demo',        'demo.elena@pulso.app',  'demo_elena')

  // atualiza created_by
  await prisma.organization.update({
    where: { id: org.id },
    data: { created_by: admin.id },
  })

  // ── membros
  const upsertMember = async (
    userId: string,
    role: 'ADMIN' | 'LEADER' | 'MEMBER',
    nickname?: string
  ) => {
    const m = await prisma.organizationMember.create({
      data: { user_id: userId, organization_id: org.id, role, nickname },
    })
    await prisma.memberStats.create({ data: { member_id: m.id } })
    return m
  }

  const mAdmin   = await upsertMember(admin.id,   'ADMIN',  'Ana')
  const mLeader  = await upsertMember(leader.id,  'LEADER', 'Bruno')
  const mCarla   = await upsertMember(member1.id, 'MEMBER', 'Carla')
  const mDiego   = await upsertMember(member2.id, 'MEMBER', 'Diego')
  const mElena   = await upsertMember(member3.id, 'MEMBER', 'Elena')

  // ── invite link demo
  await prisma.inviteLink.create({
    data: {
      organization_id: org.id,
      created_by: admin.id,
      token: 'demo-invite-link',
      role_to_assign: 'MEMBER',
    },
  })

  // ── helper de evento
  const createEvent = async (
    title: string,
    daysFromNow: number,
    isPublished: boolean
  ) => {
    const startsAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)
    startsAt.setHours(18, 0, 0, 0)
    return prisma.event.create({
      data: {
        organization_id: org.id,
        created_by: admin.id,
        title,
        location: 'Templo Central',
        starts_at: startsAt,
        confirmation_deadline: new Date(startsAt.getTime() - 48 * 60 * 60 * 1000),
        is_published: isPublished,
      },
    })
  }

  // ── helper de slot + attendance
  const addSlot = async (
    eventId: string,
    memberId: string,
    roleLabel: string,
    status: 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'DEADLINE_MISSED',
    justification?: string
  ) => {
    const slot = await prisma.scheduleSlot.create({
      data: { event_id: eventId, member_id: memberId, role_label: roleLabel },
    })
    await prisma.attendance.create({
      data: {
        slot_id: slot.id,
        member_id: memberId,
        status,
        justification: justification ?? null,
        responded_at: status !== 'PENDING' ? new Date() : null,
      },
    })
    return slot
  }

  // ── evento 1: próximo domingo (principal — confirmações mistas)
  const event1 = await createEvent('Culto de Domingo', 5, true)
  await addSlot(event1.id, mAdmin.id,  'Violão elétrico', 'CONFIRMED')
  await addSlot(event1.id, mLeader.id, 'Baixo elétrico',  'CONFIRMED')
  await addSlot(event1.id, mCarla.id,  'Teclado',         'PENDING')
  await addSlot(event1.id, mDiego.id,  'Bateria',         'DECLINED', 'Viagem de família')
  await addSlot(event1.id, mElena.id,  'Vocal',           'PENDING')

  // ── evento 2: daqui 12 dias
  const event2 = await createEvent('Culto de Domingo', 12, true)
  await addSlot(event2.id, mAdmin.id,  'Violão elétrico', 'PENDING')
  await addSlot(event2.id, mCarla.id,  'Teclado',         'CONFIRMED')
  await addSlot(event2.id, mDiego.id,  'Bateria',         'PENDING')
  await addSlot(event2.id, mElena.id,  'Vocal',           'PENDING')

  // ── evento 3: ensaio daqui 3 dias
  const event3 = await createEvent('Ensaio Geral', 3, true)
  await addSlot(event3.id, mAdmin.id,  'Violão elétrico', 'CONFIRMED')
  await addSlot(event3.id, mLeader.id, 'Baixo elétrico',  'CONFIRMED')
  await addSlot(event3.id, mCarla.id,  'Teclado',         'CONFIRMED')
  await addSlot(event3.id, mDiego.id,  'Bateria',         'CONFIRMED')
  await addSlot(event3.id, mElena.id,  'Vocal',           'CONFIRMED')

  // ── evento 4: rascunho (não publicado)
  await createEvent('Culto Especial de Natal', 30, false)

  // ── swap pendente (troca entre Carla e Diego no evento 1)
  const slotCarlaEv1 = await prisma.scheduleSlot.findFirst({
    where: { event_id: event1.id, member_id: mCarla.id },
  })
  const slotDiegoEv1 = await prisma.scheduleSlot.findFirst({
    where: { event_id: event1.id, member_id: mDiego.id },
  })
  if (slotCarlaEv1 && slotDiegoEv1) {
    await prisma.swapRequest.create({
      data: {
        organization_id: org.id,
        requester_slot_id: slotCarlaEv1.id,
        target_slot_id: slotDiegoEv1.id,
        requester_id: mCarla.id,
        target_id: mDiego.id,
        status: 'PENDING_TARGET',
        message: 'Preciso que alguém me cubra nesse domingo!',
      },
    })
  }

  // ── songs
  const songs = [
    { title: 'Nada Além do Sangue', artist: 'Fernandinho', link_type: 'YOUTUBE' as const, link_url: 'https://youtube.com/watch?v=demo1' },
    { title: 'Oceanos',             artist: 'Hillsong',    link_type: 'SPOTIFY' as const, link_url: 'https://open.spotify.com/track/demo2' },
    { title: 'Teu Reino',           artist: 'Gabriela Rocha', link_type: 'NONE' as const },
    { title: 'Grande é o Senhor',   artist: 'Ministério Zoe',  link_type: 'NONE' as const },
  ]

  for (const [i, s] of songs.entries()) {
    const song = await prisma.song.create({
      data: { organization_id: org.id, added_by: admin.id, ...s },
    })
    if (i < 3) {
      await prisma.eventSong.create({
        data: { event_id: event1.id, song_id: song.id, order: i + 1 },
      })
    }
  }

  // ── tech check items no evento 1
  const techItems = [
    { label: 'Violão elétrico',  category: 'Instrumentos', is_critical: true,  assignedTo: mAdmin.id },
    { label: 'Cabo P10 (2x)',    category: 'Cabos',        is_critical: false, assignedTo: mAdmin.id },
    { label: 'Baixo elétrico',   category: 'Instrumentos', is_critical: true,  assignedTo: mLeader.id },
    { label: 'DI Box',           category: 'Equipamento',  is_critical: true,  assignedTo: null },
    { label: 'Cabo XLR (4x)',    category: 'Cabos',        is_critical: false, assignedTo: mLeader.id },
  ]

  for (const t of techItems) {
    const item = await prisma.techCheckItem.create({
      data: {
        event_id: event1.id,
        organization_id: org.id,
        created_by: admin.id,
        label: t.label,
        category: t.category,
        is_critical: t.is_critical,
      },
    })
    if (t.assignedTo) {
      await prisma.techCheckAssignment.create({
        data: {
          item_id: item.id,
          member_id: t.assignedTo,
          status: t.assignedTo === mAdmin.id ? 'CHECKED' : 'PENDING',
          checked_at: t.assignedTo === mAdmin.id ? new Date() : null,
        },
      })
    }
  }

  // ── atualiza stats com dados realistas
  await prisma.memberStats.updateMany({
    where: { member: { user_id: admin.id, organization_id: org.id } },
    data: { confirmed_on_time: 12, absences: 0, deadline_misses: 0, reliability_score: 100 },
  })
  await prisma.memberStats.updateMany({
    where: { member: { user_id: leader.id, organization_id: org.id } },
    data: { confirmed_on_time: 10, absences: 1, deadline_misses: 0, reliability_score: 92 },
  })
  await prisma.memberStats.updateMany({
    where: { member: { user_id: member1.id, organization_id: org.id } },
    data: { confirmed_on_time: 8, absences: 2, deadline_misses: 1, reliability_score: 78 },
  })
  await prisma.memberStats.updateMany({
    where: { member: { user_id: member2.id, organization_id: org.id } },
    data: { confirmed_on_time: 6, absences: 3, deadline_misses: 2, reliability_score: 65 },
  })
  await prisma.memberStats.updateMany({
    where: { member: { user_id: member3.id, organization_id: org.id } },
    data: { confirmed_on_time: 11, absences: 1, deadline_misses: 0, reliability_score: 95 },
  })

  console.log(`
✅ Demo seed concluído!

Org:    Demo Pulso (slug: demo-pulso)
Users:  demo.admin@pulso.app  (ADMIN)
        demo.leader@pulso.app (LEADER)
        demo.carla@pulso.app  (MEMBER)
        demo.diego@pulso.app  (MEMBER)
        demo.elena@pulso.app  (MEMBER)
Invite: /invite/demo-invite-link
Eventos: 4 (3 publicados + 1 rascunho)
  `)
}

seedDemo()
  .catch((e) => { console.error('❌ Erro no seed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())