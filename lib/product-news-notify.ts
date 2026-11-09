import 'server-only'
import { escapeHtml } from '@/lib/escape-html'
import { sendEmail } from '@/lib/mailer'
import { logOperationalEvent } from '@/lib/observability'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'

type NotifyDb = Pick<ExtendedTransactionClient, 'productNewsSubscription' | 'userNotification'>
type NotificationChannel = 'app' | 'email' | 'both'
export type ProductNews = {
  type: 'info' | 'success' | 'promo'
  title: string
  message: string
  link: string
}

function normalizeChannel(channel: string | null | undefined): NotificationChannel {
  return channel === 'email' || channel === 'both' ? channel : 'app'
}

function isValidEmail(email: string | null | undefined): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function buildEmailHtml(news: ProductNews): string {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
  const fullLink = `${siteUrl}${news.link}`
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="font-size:18px;color:#111827">${escapeHtml(news.title)}</h2>
      <p style="font-size:14px;color:#374151;line-height:1.5">${escapeHtml(news.message)}</p>
      <a href="${escapeHtml(fullLink)}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none">Open</a>
      <p style="font-size:12px;color:#9ca3af">You received this because you subscribed to product notifications.</p>
    </div>`
}

type NewsFlag = 'notifyPrice' | 'notifyStock' | 'notifyPromo'
type Subscriber = { userId: string; user: { email: string; notificationChannel: string | null } }

/** Who receives a product news item, split by channel; read-only. */
export type ProductNewsPlan = {
  productId: string
  subscribers: Subscriber[]
  emailTargets: Array<{ userId: string; email: string }>
  skippedInvalidEmail: number
  appRecipients: Subscriber[]
}

export async function planProductNews(productId: string, flag: NewsFlag, db: NotifyDb): Promise<ProductNewsPlan> {
  const subscribers = await db.productNewsSubscription.findMany({
    where: { productId, [flag]: true },
    select: {
      userId: true,
      user: { select: { email: true, notificationChannel: true } },
    },
  })
  const emailTargets: ProductNewsPlan['emailTargets'] = []
  let skippedInvalidEmail = 0
  for (const subscriber of subscribers) {
    const channel = normalizeChannel(subscriber.user.notificationChannel)
    if (channel !== 'email' && channel !== 'both') continue
    if (!isValidEmail(subscriber.user.email)) {
      skippedInvalidEmail++
      logOperationalEvent({
        event: 'product_news_email_skipped',
        level: 'warn',
        reason: 'missing_or_invalid_email',
        userId: subscriber.userId,
        productId,
      })
      continue
    }
    emailTargets.push({ userId: subscriber.userId, email: subscriber.user.email.trim() })
  }
  const appRecipients = subscribers.filter((subscriber) => {
    const channel = normalizeChannel(subscriber.user.notificationChannel)
    return channel === 'app' || channel === 'both'
  })
  return { productId, subscribers, emailTargets, skippedInvalidEmail, appRecipients }
}

/** Sends the emails of a plan; resolves to the user IDs actually delivered and the failure count. */
export async function sendProductNewsEmails(
  plan: ProductNewsPlan,
  news: ProductNews,
): Promise<{ delivered: Set<string>; failed: number }> {
  const delivered = new Set<string>()
  let failed = 0
  await Promise.all(plan.emailTargets.map(async (target) => {
    try {
      await sendEmail(target.email, news.title, buildEmailHtml(news))
      delivered.add(target.userId)
    } catch (error) {
      failed++
      logOperationalEvent({
        event: 'product_news_email_failed',
        level: 'error',
        userId: target.userId,
        productId: plan.productId,
      }, error)
    }
  }))
  return { delivered, failed }
}

/** In-app notification rows for a plan, flagged with the email outcome. */
export type ProductNewsNotification = ProductNews & { userId: string; channel: NotificationChannel; emailSent: boolean }
export function productNewsNotifications(plan: ProductNewsPlan, news: ProductNews, delivered: Set<string>): ProductNewsNotification[] {
  return plan.appRecipients.map((subscriber) => ({
    userId: subscriber.userId,
    ...news,
    channel: normalizeChannel(subscriber.user.notificationChannel),
    emailSent: delivered.has(subscriber.userId),
  }))
}

async function deliverProductNews(
  productId: string,
  flag: NewsFlag,
  news: ProductNews,
  db: NotifyDb,
): Promise<void> {
  const plan = await planProductNews(productId, flag, db)
  if (plan.subscribers.length === 0) return
  const { delivered } = await sendProductNewsEmails(plan, news)
  const data = productNewsNotifications(plan, news, delivered)
  if (data.length === 0) return
  await db.userNotification.createMany({ data })
}

export async function notifyPriceChange(
  productId: string,
  productTitle: string,
  oldPrice: number,
  newPrice: number,
  db: NotifyDb = prisma,
): Promise<void> {
  const direction = newPrice < oldPrice ? 'снизилась' : 'изменилась'
  await deliverProductNews(productId, 'notifyPrice', {
    type: 'info',
    title: 'Изменилась цена',
    message: `Цена на «${productTitle}» ${direction}: €${oldPrice.toFixed(2)} → €${newPrice.toFixed(2)}.`,
    link: `/product/${productId}`,
  }, db)
}

export async function notifyRestock(
  productId: string,
  productTitle: string,
  db: NotifyDb = prisma,
): Promise<void> {
  await deliverProductNews(productId, 'notifyStock', {
    type: 'success',
    title: 'Товар снова в наличии',
    message: `«${productTitle}» появился на складе.`,
    link: `/product/${productId}`,
  }, db)
}

export function promoNews(productId: string, productTitle: string, message: string | undefined): ProductNews {
  return {
    type: 'promo',
    title: 'Акция на товар',
    message: message?.trim() || `Специальное предложение на «${productTitle}».`,
    link: `/product/${productId}`,
  }
}

export async function notifyPromo(
  productId: string,
  productTitle: string,
  message: string | undefined,
  db: NotifyDb = prisma,
): Promise<void> {
  await deliverProductNews(productId, 'notifyPromo', promoNews(productId, productTitle, message), db)
}
