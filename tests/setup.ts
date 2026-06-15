import { execSync } from 'node:child_process'
import { beforeAll } from 'vitest'
import dotenv from 'dotenv'

// carrega .env.test antes de qualquer coisa
dotenv.config({ path: '.env.test' })

// roda as migrations no banco de teste antes da suite inteira
beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env },
    stdio: 'inherit',
  })
})