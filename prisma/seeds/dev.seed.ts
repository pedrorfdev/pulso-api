import "dotenv/config";
import { PrismaClient } from "../../src/lib/prisma/generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function seedDev() {
  console.log("🌱 Seeding dev data...");

  const createUser = async (name: string, email: string, googleId: string) =>
    prisma.user.upsert({
      where: { email },
      update: { name },
      create: { name, email, google_id: googleId },
    });

  const pedro = await createUser(
    "Pedro Ferreira",
    "pedrorf.dev@gmail.com",
    "google_pedro_dev",
  );
  const lucas = await createUser(
    "Lucas Moura",
    "lucas@pulso.app",
    "google_lucas_dev",
  );
  const ana = await createUser("Ana Silva", "ana@pulso.app", "google_ana_dev");
  const joao = await createUser(
    "João Pereira",
    "joao@pulso.app",
    "google_joao_dev",
  );
  const mari = await createUser(
    "Mariana Costa",
    "mari@pulso.app",
    "google_mari_dev",
  );

  const org = await prisma.organization.upsert({
    where: { slug: "jovens-conexao" },
    update: { created_by: pedro.id },
    create: {
      name: "Jovens Conexão",
      slug: "jovens-conexao",
      description: "Ministério de louvor dos jovens",
      confirmation_deadline_hours: 48,
      absences_public: true,
      justifications_public: false,
      created_by: pedro.id,
    },
  });

  // ── limpa APENAS dados da org dev
  await prisma.notification.deleteMany({ where: { organization_id: org.id } });
  await prisma.memberStats.deleteMany({
    where: { member: { organization_id: org.id } },
  });
  await prisma.eventSong.deleteMany({
    where: { event: { organization_id: org.id } },
  });
  await prisma.swapRequest.deleteMany({ where: { organization_id: org.id } });
  await prisma.attendance.deleteMany({
    where: { slot: { event: { organization_id: org.id } } },
  });
  await prisma.scheduleSlot.deleteMany({
    where: { event: { organization_id: org.id } },
  });
  await prisma.event.deleteMany({ where: { organization_id: org.id } });
  await prisma.song.deleteMany({ where: { organization_id: org.id } });
  await prisma.inviteLink.deleteMany({ where: { organization_id: org.id } });
  await prisma.organizationMember.deleteMany({
    where: { organization_id: org.id },
  });

  console.log("🧹 Dev org limpa");

  const upsertMember = async (
    userId: string,
    role: "ADMIN" | "LEADER" | "MEMBER",
    nickname?: string,
  ) => {
    const m = await prisma.organizationMember.create({
      data: { user_id: userId, organization_id: org.id, role, nickname },
    });
    // Stats criados com zeros — serão atualizados depois
    await prisma.memberStats.create({ data: { member_id: m.id } });
    return m;
  };

  const mPedro = await upsertMember(pedro.id, "ADMIN", "Pedro");
  const mLucas = await upsertMember(lucas.id, "LEADER", "Lucas");
  const mAna = await upsertMember(ana.id, "MEMBER", "Ana");
  const mJoao = await upsertMember(joao.id, "MEMBER", "João");
  const mMari = await upsertMember(mari.id, "MEMBER", "Mari");

  await prisma.inviteLink.upsert({
    where: { token: "dev-invite-token" },
    update: {},
    create: {
      organization_id: org.id,
      created_by: pedro.id,
      token: "dev-invite-token",
      role_to_assign: "MEMBER",
    },
  });

  // ── Helper: cria evento em X dias a partir de hoje (negativo = passado)
  const createEvent = async (
    title: string,
    daysFromNow: number,
    published: boolean,
    location = "Templo Principal",
  ) => {
    const startsAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    startsAt.setHours(18, 0, 0, 0);
    return prisma.event.create({
      data: {
        organization_id: org.id,
        created_by: pedro.id,
        title,
        location,
        starts_at: startsAt,
        confirmation_deadline: new Date(
          startsAt.getTime() - 48 * 60 * 60 * 1000,
        ),
        is_published: published,
      },
    });
  };

  // ── Helper: cria slot + attendance num evento já passado (respondido)
  const addSlot = async (
    eventId: string,
    memberId: string,
    roleLabels: string[],
    status: "PENDING" | "CONFIRMED" | "DECLINED" | "DEADLINE_MISSED" | "SWAPPED",
    justification?: string,
    respondedAt?: Date,
  ) => {
    const slot = await prisma.scheduleSlot.create({
      data: { event_id: eventId, member_id: memberId, role_labels: roleLabels },
    });
    await prisma.attendance.create({
      data: {
        slot_id: slot.id,
        member_id: memberId,
        status,
        justification: justification ?? null,
        responded_at: respondedAt ?? (status !== "PENDING" ? new Date() : null),
      },
    });
    return slot;
  };

  // ─────────────────────────────────────────
  // HISTÓRICO PASSADO (6 eventos — para stats)
  // ─────────────────────────────────────────

  // Evento -42 dias
  const evP1 = await createEvent("Culto de Domingo", -42, true);
  await addSlot(evP1.id, mPedro.id, ["Violão elétrico"], "CONFIRMED", undefined, new Date(Date.now() - 44 * 86400000));
  await addSlot(evP1.id, mLucas.id, ["Baixo elétrico"], "CONFIRMED", undefined, new Date(Date.now() - 44 * 86400000));
  await addSlot(evP1.id, mAna.id, ["Teclado"], "CONFIRMED", undefined, new Date(Date.now() - 44 * 86400000));
  await addSlot(evP1.id, mJoao.id, ["Bateria"], "DECLINED", "Viagem de trabalho");
  await addSlot(evP1.id, mMari.id, ["Vocal"], "CONFIRMED", undefined, new Date(Date.now() - 43 * 86400000));

  // Evento -35 dias
  const evP2 = await createEvent("Ensaio Geral", -35, true);
  await addSlot(evP2.id, mPedro.id, ["Violão elétrico"], "CONFIRMED", undefined, new Date(Date.now() - 37 * 86400000));
  await addSlot(evP2.id, mLucas.id, ["Baixo elétrico"], "CONFIRMED", undefined, new Date(Date.now() - 37 * 86400000));
  await addSlot(evP2.id, mAna.id, ["Teclado"], "DEADLINE_MISSED");
  await addSlot(evP2.id, mMari.id, ["Vocal"], "CONFIRMED", undefined, new Date(Date.now() - 37 * 86400000));

  // Evento -28 dias
  const evP3 = await createEvent("Culto de Domingo", -28, true);
  await addSlot(evP3.id, mPedro.id, ["Violão elétrico"], "CONFIRMED", undefined, new Date(Date.now() - 30 * 86400000));
  await addSlot(evP3.id, mLucas.id, ["Baixo elétrico"], "CONFIRMED", undefined, new Date(Date.now() - 29 * 86400000));
  await addSlot(evP3.id, mAna.id, ["Teclado"], "CONFIRMED", undefined, new Date(Date.now() - 30 * 86400000));
  await addSlot(evP3.id, mJoao.id, ["Bateria"], "DECLINED", "Problema de saúde");
  await addSlot(evP3.id, mMari.id, ["Vocal", "Backing vocal"], "CONFIRMED", undefined, new Date(Date.now() - 30 * 86400000));

  // Evento -21 dias
  const evP4 = await createEvent("Culto Especial", -21, true, "Auditório Central");
  await addSlot(evP4.id, mPedro.id, ["Violão elétrico"], "CONFIRMED", undefined, new Date(Date.now() - 23 * 86400000));
  await addSlot(evP4.id, mLucas.id, ["Baixo elétrico"], "DEADLINE_MISSED");
  await addSlot(evP4.id, mAna.id, ["Teclado"], "CONFIRMED", undefined, new Date(Date.now() - 23 * 86400000));
  await addSlot(evP4.id, mJoao.id, ["Bateria"], "CONFIRMED", undefined, new Date(Date.now() - 23 * 86400000));
  await addSlot(evP4.id, mMari.id, ["Vocal"], "CONFIRMED", undefined, new Date(Date.now() - 23 * 86400000));

  // Evento -14 dias
  const evP5 = await createEvent("Culto de Domingo", -14, true);
  await addSlot(evP5.id, mPedro.id, ["Violão elétrico"], "CONFIRMED", undefined, new Date(Date.now() - 16 * 86400000));
  await addSlot(evP5.id, mLucas.id, ["Baixo elétrico"], "CONFIRMED", undefined, new Date(Date.now() - 16 * 86400000));
  await addSlot(evP5.id, mJoao.id, ["Bateria"], "DECLINED", "Compromisso familiar");
  await addSlot(evP5.id, mMari.id, ["Vocal"], "CONFIRMED", undefined, new Date(Date.now() - 15 * 86400000));

  // Evento -7 dias
  const evP6 = await createEvent("Ensaio Geral", -7, true);
  await addSlot(evP6.id, mPedro.id, ["Violão elétrico"], "CONFIRMED", undefined, new Date(Date.now() - 9 * 86400000));
  await addSlot(evP6.id, mLucas.id, ["Baixo elétrico"], "CONFIRMED", undefined, new Date(Date.now() - 9 * 86400000));
  await addSlot(evP6.id, mAna.id, ["Teclado"], "CONFIRMED", undefined, new Date(Date.now() - 9 * 86400000));
  await addSlot(evP6.id, mJoao.id, ["Bateria"], "CONFIRMED", undefined, new Date(Date.now() - 9 * 86400000));
  await addSlot(evP6.id, mMari.id, ["Vocal"], "CONFIRMED", undefined, new Date(Date.now() - 9 * 86400000));

  // ─────────────────────────────────────────
  // EVENTOS FUTUROS
  // ─────────────────────────────────────────

  // Evento principal — próxima semana
  const ev1 = await createEvent("Culto de Domingo", 7, true);
  await addSlot(ev1.id, mPedro.id, ["Violão elétrico"], "CONFIRMED");
  await addSlot(ev1.id, mLucas.id, ["Baixo elétrico"], "PENDING");
  await addSlot(ev1.id, mAna.id, ["Teclado"], "CONFIRMED");
  await addSlot(ev1.id, mJoao.id, ["Bateria"], "DECLINED", "Viagem de família");
  await addSlot(ev1.id, mMari.id, ["Vocal"], "PENDING");

  // Ensaio — daqui 3 dias
  const ev2 = await createEvent("Ensaio Geral", 3, true);
  await addSlot(ev2.id, mPedro.id, ["Violão elétrico"], "CONFIRMED");
  await addSlot(ev2.id, mLucas.id, ["Baixo elétrico"], "CONFIRMED");
  await addSlot(ev2.id, mAna.id, ["Teclado"], "CONFIRMED");

  // Próximo domingo — daqui 14 dias
  const ev3 = await createEvent("Culto de Domingo", 14, true);
  await addSlot(ev3.id, mPedro.id, ["Violão elétrico"], "PENDING");
  await addSlot(ev3.id, mJoao.id, ["Bateria"], "PENDING");
  await addSlot(ev3.id, mMari.id, ["Vocal"], "PENDING");

  // Rascunho
  await createEvent("Culto Especial", 21, false);

  // ─────────────────────────────────────────
  // SONGS
  // ─────────────────────────────────────────
  const songData = [
    {
      title: "Nada Além do Sangue",
      artist: "Fernandinho",
      link_type: "YOUTUBE" as const,
    },
    { title: "Oceanos", artist: "Hillsong", link_type: "SPOTIFY" as const },
    {
      title: "Teu Reino",
      artist: "Gabriela Rocha",
      link_type: "NONE" as const,
    },
  ];

  for (const [i, s] of songData.entries()) {
    const song = await prisma.song.create({
      data: { organization_id: org.id, added_by: pedro.id, ...s },
    });
    await prisma.eventSong.create({
      data: { event_id: ev1.id, song_id: song.id, order: i + 1 },
    });
  }

  // ─────────────────────────────────────────
  // MEMBER STATS — populados com histórico realista
  // Pedro: presença exemplar, poucos swaps
  // Lucas: bom, mas perdeu 1 prazo
  // Ana:   confiável, 1 deadline miss
  // João:  3 faltas, score mais baixo
  // Mari:  muito confiável, 0 faltas
  // ─────────────────────────────────────────
  const statsData = [
    {
      memberId: mPedro.id,
      confirmedOnTime: 6,
      confirmedLate: 0,
      absences: 0,
      deadlineMisses: 0,
      swapsRequested: 0,
      swapsAccepted: 1,
      reliabilityScore: 100,
    },
    {
      memberId: mLucas.id,
      confirmedOnTime: 4,
      confirmedLate: 1,
      absences: 0,
      deadlineMisses: 1,
      swapsRequested: 0,
      swapsAccepted: 0,
      reliabilityScore: 87.5,
    },
    {
      memberId: mAna.id,
      confirmedOnTime: 4,
      confirmedLate: 0,
      absences: 0,
      deadlineMisses: 1,
      swapsRequested: 1,
      swapsAccepted: 0,
      reliabilityScore: 90,
    },
    {
      memberId: mJoao.id,
      confirmedOnTime: 2,
      confirmedLate: 1,
      absences: 3,
      deadlineMisses: 0,
      swapsRequested: 1,
      swapsAccepted: 0,
      reliabilityScore: 62.5,
    },
    {
      memberId: mMari.id,
      confirmedOnTime: 5,
      confirmedLate: 1,
      absences: 0,
      deadlineMisses: 0,
      swapsRequested: 0,
      swapsAccepted: 0,
      reliabilityScore: 97,
    },
  ];

  for (const s of statsData) {
    await prisma.memberStats.update({
      where: { member_id: s.memberId },
      data: {
        confirmed_on_time: s.confirmedOnTime,
        confirmed_late: s.confirmedLate,
        absences: s.absences,
        deadline_misses: s.deadlineMisses,
        swaps_requested: s.swapsRequested,
        swaps_accepted: s.swapsAccepted,
        reliability_score: s.reliabilityScore,
      },
    });
  }

  console.log(`
✅ Dev seed concluído!

Org:    Jovens Conexão (slug: jovens-conexao)
Users:  pedrorf.dev@gmail.com (ADMIN)  — score 100 🏆
        lucas@pulso.app       (LEADER) — score 87.5
        ana@pulso.app         (MEMBER) — score 90
        joao@pulso.app        (MEMBER) — score 62.5 ⚠️ (3 faltas)
        mari@pulso.app        (MEMBER) — score 97
Invite: http://localhost:5173/join/dev-invite-token
API:    http://localhost:3333
  `);
}

seedDev()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
