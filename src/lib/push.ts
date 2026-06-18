import webpush from 'web-push'
import { env } from './env.js'

webpush.setVapidDetails(
  env.VAPID_EMAIL,
  env.VAPID_PUBLIC_KEY,
  env.VAPID_PRIVATE_KEY
)

export type PushPayload = {
  title: string
  body: string
  data?: Record<string, string>
}

export async function sendPush(
  subscription: unknown,
  payload: PushPayload
): Promise<void> {
  try {
    await webpush.sendNotification(
      subscription as webpush.PushSubscription,
      JSON.stringify(payload)
    )
  } catch (err: unknown) {
    // subscription expirada ou inválida — não quebra o fluxo
    const status = (err as { statusCode?: number }).statusCode
    if (status === 410 || status === 404) {
      console.warn('Push subscription inválida ou expirada — ignorando')
      return
    }
    throw err
  }
}

export async function sendPushToMany(
  subscriptions: unknown[],
  payload: PushPayload
): Promise<void> {
  await Promise.allSettled(
    subscriptions.map((sub) => sendPush(sub, payload))
  )
}