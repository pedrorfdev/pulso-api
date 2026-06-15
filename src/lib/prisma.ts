import { PrismaClient } from './prisma/generated/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { env } from './env.js'

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  })

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}