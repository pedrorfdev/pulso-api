import cron from 'node-cron'
import { prisma } from '../lib/prisma.js'

// roda à meia-noite todo dia
export function startStatsJob() {
  cron.schedule('0 0 * * *', async () => {
    console.log('[stats-job] recalculando reliability scores...')

    try {
      const allStats = await prisma.memberStats.findMany()

      for (const stats of allStats) {
        const total =
          stats.confirmed_on_time +
          stats.confirmed_late +
          stats.absences +
          stats.deadline_misses

        if (total === 0) continue

        // fórmula: pontos positivos / total de participações
        // confirmed_on_time = 1pt, confirmed_late = 0.5pt, absence = -0.5pt, missed = -1pt
        const score =
          (stats.confirmed_on_time * 1 +
            stats.confirmed_late * 0.5 +
            stats.absences * -0.5 +
            stats.deadline_misses * -1) /
          total

        // normaliza pra 0-100
        const normalized = Math.max(0, Math.min(100, 50 + score * 50))

        await prisma.memberStats.update({
          where: { id: stats.id },
          data: { reliability_score: Math.round(normalized * 10) / 10 },
        })
      }

      console.log(`[stats-job] ${allStats.length} membro(s) atualizados`)
    } catch (err) {
      console.error('[stats-job] erro:', err)
    }
  })

  console.log('[stats-job] agendado — roda à meia-noite')
}