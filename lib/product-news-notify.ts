import 'server-only'
import { escapeHtml } from '@/lib/escape-html'
import { sendEmail } from '@/lib/mailer'
import { logOperationalEvent } from '@/lib/observability'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'

type NotifyDb = Pick<ExtendedTransactionClient, 'productNewsSubscription' | 'userNotification'>
type NotificationChannel = 'app' | 'email' | 'both'
type ProductNews = {
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

async function deliverProductNews(
  productId: string,
  flag: 'notifyPrice' | 'notifyStock' | 'notifyPromo',
  news: ProductNews,
  db: NotifyDb,
): Promise<void> {
  const subscribers = await db.productNewsSubscription.findMany({
    where: { productId, [flag]: true },
    select: {
      userId: true,
      user: { select: { email: true, notificationChannel: true } },
    },
  })
  if (subscribers.length === 0) return

  const emailDelivered = new Set<string>()
  await Promise.all(subscribers.map(async (subscriber) => {
    const channel = normalizeChannel(subscriber.user.notificationChannel)
    if (channel !== 'email' && channel !== 'both') return

    if (!isValidEmail(subscriber.user.email)) {
      logOperationalEvent({
        event: 'product_news_email_skipped',
        level: 'warn',
        reason: 'missing_or_invalid_email',
        userId: subscriber.userId,
        productId,
      })
      return
    }

    try {
      await sendEmail(subscriber.user.email.trim(), news.title, buildEmailHtml(news))
      emailDelivered.add(subscriber.userId)
    } catch (error) {
      logOperationalEvent({
        event: 'product_news_email_failed',
        level: 'error',
        userId: subscriber.userId,
        productId,
      }, error)
    }
  }))

  const appRecipients = subscribers.filter((subscriber) => {
    const channel = normalizeChannel(subscriber.user.notificationChannel)
    return channel === 'app' || channel === 'both'
  })
  if (appRecipients.length === 0) return

  await db.userNotification.createMany({
    data: appRecipients.map((subscriber) => ({
      userId: subscriber.userId,
      ...news,
      channel: normalizeChannel(subscriber.user.notificationChannel),
      emailSent: emailDelivered.has(subscriber.userId),
    })),
  })
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

export async function notifyPromo(
  productId: string,
  productTitle: string,
  message: string | undefined,
  db: NotifyDb = prisma,
): Promise<void> {
  await deliverProductNews(productId, 'notifyPromo', {
    type: 'promo',
    title: 'Акция на товар',
    message: message?.trim() || `Специальное предложение на «${productTitle}».`,
    link: `/product/${productId}`,
  }, db)
}
