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
  await prisma.techCheckAssignment.deleteMany({
    where: { item: { organization_id: org.id } },
  });
  await prisma.techCheckItem.deleteMany({ where: { organization_id: org.id } });
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

  // ── IDs gerados pelo Prisma (UUIDs válidos) — sem id: fixo
  const createEvent = async (
    title: string,
    daysFromNow: number,
    published: boolean,
  ) => {
    const startsAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    startsAt.setHours(18, 0, 0, 0);
    return prisma.event.create({
      data: {
        organization_id: org.id,
        created_by: pedro.id,
        title,
        location: "Templo Principal",
        starts_at: startsAt,
        confirmation_deadline: new Date(
          startsAt.getTime() - 48 * 60 * 60 * 1000,
        ),
        is_published: published,
      },
    });
  };

  const addSlot = async (
    eventId: string,
    memberId: string,
    roleLabels: string[],
    status: "PENDING" | "CONFIRMED" | "DECLINED",
    justification?: string,
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
        responded_at: status !== "PENDING" ? new Date() : null,
      },
    });
    return slot;
  };

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

  // ── Songs sem id: fixo
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

  // Tech check
  const items = [
    {
      label: "Violão elétrico",
      category: "Instrumentos",
      is_critical: true,
      assignedTo: mPedro.id,
      status: "CHECKED" as const,
    },
    {
      label: "Cabo P10 (2x)",
      category: "Cabos",
      is_critical: false,
      assignedTo: mPedro.id,
      status: "CHECKED" as const,
    },
    {
      label: "DI Box",
      category: "Equipamento",
      is_critical: true,
      assignedTo: null,
      status: "PENDING" as const,
    },
    {
      label: "Baixo elétrico",
      category: "Instrumentos",
      is_critical: true,
      assignedTo: mLucas.id,
      status: "PENDING" as const,
    },
  ];

  for (const t of items) {
    const item = await prisma.techCheckItem.create({
      data: {
        event_id: ev1.id,
        organization_id: org.id,
        created_by: pedro.id,
        label: t.label,
        category: t.category,
        is_critical: t.is_critical,
      },
    });
    if (t.assignedTo) {
      await prisma.techCheckAssignment.create({
        data: {
          item_id: item.id,
          member_id: t.assignedTo,
          status: t.status,
          checked_at: t.status === "CHECKED" ? new Date() : null,
        },
      });
    }
  }

  console.log(`
✅ Dev seed concluído!

Org:    Jovens Conexão (slug: jovens-conexao)
Users:  pedrorf.dev@gmail.com (ADMIN)
        lucas@pulso.app       (LEADER)
        ana@pulso.app         (MEMBER)
        joao@pulso.app        (MEMBER)
        mari@pulso.app        (MEMBER)
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
