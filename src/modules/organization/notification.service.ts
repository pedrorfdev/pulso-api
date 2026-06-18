import { PrismaClient } from '../../lib/prisma/generated/client.js'
import { sendPushToMany } from '../../lib/push.js'
import type { PushPayload } from '../../lib/push.js'

export class NotificationService {
  constructor(private db: PrismaClient) {}

  // salva subscription do Web Push no user
  async saveSubscription(userId: string, subscription: unknown): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { push_subscription: subscription as any },
    })
  }

  // envia push pra todos os membros de uma org que têm subscription
  async pushToOrg(orgId: string, payload: PushPayload): Promise<void> {
    const members = await this.db.organizationMember.findMany({
      where: { organization_id: orgId, is_active: true },
      include: {
        user: { select: { id: true, push_subscription: true } },
      },
    })

    const subscriptions = members
      .map((m) => m.user.push_subscription)
      .filter(Boolean)

    if (subscriptions.length === 0) return

    await sendPushToMany(subscriptions, payload)

    // loga no banco
    await this.db.notification.createMany({
      data: members
        .filter((m) => m.user.push_subscription)
        .map((m) => ({
          user_id: m.user.id,
          organization_id: orgId,
          type: payload.data?.type ?? 'GENERAL',
          title: payload.title,
          body: payload.body,
          // omite o campo em vez de passar null — Prisma JSON não aceita null literal aqui
          ...(payload.data ? { data: payload.data } : {}),
        })),
    })
  }

  // lista notificações do usuário
  async listNotifications(userId: string, orgId: string) {
    return this.db.notification.findMany({
      where: { user_id: userId, organization_id: orgId },
      orderBy: { sent_at: 'desc' },
      take: 50,
    })
  }

  // marca como lida
  async markRead(notificationId: string, userId: string): Promise<void> {
    await this.db.notification.updateMany({
      where: { id: notificationId, user_id: userId },
      data: { read_at: new Date() },
    })
  }

  // marca todas como lidas
  async markAllRead(userId: string, orgId: string): Promise<void> {
    await this.db.notification.updateMany({
      where: { user_id: userId, organization_id: orgId, read_at: null },
      data: { read_at: new Date() },
    })
  }
}