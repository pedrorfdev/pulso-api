import cron from 'node-cron'
import { prisma } from '../lib/prisma.js'
import { sendPushToMany } from '../lib/push.js'

// roda a cada hora
export function startDeadlineJob() {
  cron.schedule('0 * * * *', async () => {
    console.log('[deadline-job] verificando prazos vencidos...')

    try {
      // busca attendances PENDING cujo deadline já passou
      const expired = await prisma.attendance.findMany({
        where: {
          status: 'PENDING',
          slot: {
            event: {
              confirmation_deadline: { lt: new Date() },
              is_published: true,
            },
          },
        },
        include: {
          member: {
            include: {
              user: { select: { id: true, push_subscription: true } },
              stats: true,
            },
          },
          slot: {
            include: {
              event: {
                select: { id: true, title: true, organization_id: true },
              },
            },
          },
        },
      })

      if (expired.length === 0) {
        console.log('[deadline-job] nenhum prazo vencido')
        return
      }

      console.log(`[deadline-job] ${expired.length} attendance(s) vencida(s)`)

      for (const attendance of expired) {
        // marca como DEADLINE_MISSED
        await prisma.attendance.update({
          where: { id: attendance.id },
          data: { status: 'DEADLINE_MISSED' },
        })

        // incrementa deadline_misses nas stats
        await prisma.memberStats.upsert({
          where: { member_id: attendance.member_id },
          update: { deadline_misses: { increment: 1 } },
          create: { member_id: attendance.member_id, deadline_misses: 1 },
        })

        // salva notificação no log
        await prisma.notification.create({
          data: {
            user_id: attendance.member.user.id,
            organization_id: attendance.slot.event.organization_id,
            type: 'DEADLINE_MISSED',
            title: 'Prazo de confirmação encerrado',
            body: `Você não confirmou presença em "${attendance.slot.event.title}" a tempo.`,
            data: { event_id: attendance.slot.event.id },
          },
        })

        // envia push se tiver subscription
        if (attendance.member.user.push_subscription) {
          await sendPushToMany([attendance.member.user.push_subscription], {
            title: 'Prazo encerrado',
            body: `Você não confirmou presença em "${attendance.slot.event.title}".`,
            data: { event_id: attendance.slot.event.id },
          })
        }
      }

      console.log('[deadline-job] concluído')
    } catch (err) {
      console.error('[deadline-job] erro:', err)
    }
  })

  console.log('[deadline-job] agendado — roda a cada hora')
}