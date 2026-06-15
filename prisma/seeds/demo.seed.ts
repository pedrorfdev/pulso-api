import 'dotenv/config'
import { PrismaClient } from '../../src/lib/prisma/generated/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function seedDemo() {
  console.log('🌱 Seeding demo org...')

  // busca a org demo
  const demoOrg = await prisma.organization.findUnique({
    where: { slug: 'demo-pulso' },
  })

  if (!demoOrg) {
    throw new Error('Demo org não encontrada. Crie a org demo primeiro.')
  }

  // limpa APENAS os dados da org demo — dados reais ficam intocados
  await prisma.notification.deleteMany({ where: { organization_id: demoOrg.id } })
  await prisma.swapRequest.deleteMany({ where: { organization_id: demoOrg.id } })
  await prisma.event.deleteMany({ where: { organization_id: demoOrg.id } })
  await prisma.song.deleteMany({ where: { organization_id: demoOrg.id } })
  await prisma.organizationMember.deleteMany({ where: { organization_id: demoOrg.id } })

  console.log('🧹 Demo org limpa')
  console.log('✅ Demo seed concluído')
}

seedDemo()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })