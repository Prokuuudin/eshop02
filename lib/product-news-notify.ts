import 'server-only'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'

type NotifyDb = Pick<ExtendedTransactionClient, 'productNewsSubscription' | 'userNotification'>

export async function notifyPriceChange(
  productId: string,
  productTitle: string,
  oldPrice: number,
  newPrice: number,
  db: NotifyDb = prisma,
): Promise<void> {
  const subscribers = await db.productNewsSubscription.findMany({
    where: { productId, notifyPrice: true },
    select: { userId: true },
  })
  if (subscribers.length === 0) return

  const direction = newPrice < oldPrice ? 'снизилась' : 'изменилась'
  await db.userNotification.createMany({
    data: subscribers.map((s) => ({
      userId: s.userId,
      type: 'info',
      title: 'Изменилась цена',
      message: `Цена на «${productTitle}» ${direction}: €${oldPrice.toFixed(2)} → €${newPrice.toFixed(2)}.`,
      link: `/product/${productId}`,
      channel: 'app',
    })),
  })
}

export async function notifyRestock(
  productId: string,
  productTitle: string,
  db: NotifyDb = prisma,
): Promise<void> {
  const subscribers = await db.productNewsSubscription.findMany({
    where: { productId, notifyStock: true },
    select: { userId: true },
  })
  if (subscribers.length === 0) return

  await db.userNotification.createMany({
    data: subscribers.map((s) => ({
      userId: s.userId,
      type: 'success',
      title: 'Товар снова в наличии',
      message: `«${productTitle}» появился на складе.`,
      link: `/product/${productId}`,
      channel: 'app',
    })),
  })
}

export async function notifyPromo(
  productId: string,
  productTitle: string,
  message: string | undefined,
  db: NotifyDb = prisma,
): Promise<void> {
  const subscribers = await db.productNewsSubscription.findMany({
    where: { productId, notifyPromo: true },
    select: { userId: true },
  })
  if (subscribers.length === 0) return

  const text = message?.trim() || `Специальное предложение на «${productTitle}».`
  await db.userNotification.createMany({
    data: subscribers.map((s) => ({
      userId: s.userId,
      type: 'promo',
      title: 'Акция на товар',
      message: text,
      link: `/product/${productId}`,
      channel: 'app',
    })),
  })
}
