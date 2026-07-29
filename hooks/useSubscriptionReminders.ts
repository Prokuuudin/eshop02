import { useEffect } from 'react'
import { useSubscriptionStore } from '@/lib/subscription-store'
import { useNotificationsStore } from '@/lib/notifications-store'
import { formatEuro } from '@/lib/utils'

const REMIND_DAYS_BEFORE = 3

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function useSubscriptionReminders(userId: string | null): void {
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)
  const markReminded = useSubscriptionStore((s) => s.markReminded)
  const addNotification = useNotificationsStore((s) => s.addNotification)

  useEffect(() => {
    if (!userId) return

    const now = new Date()
    const threshold = new Date(now)
    threshold.setDate(threshold.getDate() + REMIND_DAYS_BEFORE)

    subscriptions
      .filter((s) => s.userId === userId && s.status === 'active')
      .forEach((sub) => {
        const nextDate = new Date(sub.nextOrderDate)

        // Напоминаем если дата <= порога и ещё не напоминали сегодня
        const alreadyRemindedToday =
          sub.remindedAt && isSameDay(new Date(sub.remindedAt), now)

        if (nextDate <= threshold && !alreadyRemindedToday) {
          const daysLeft = Math.max(
            0,
            Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          )

          const discountedPrice = parseFloat(
            (sub.pricePerUnit * (1 - sub.discountPercent / 100)).toFixed(2)
          )
          const total = formatEuro(discountedPrice * sub.quantity, 'en-US')

          const title =
            daysLeft === 0
              ? 'Сегодня заказ по подписке'
              : `Заказ по подписке через ${daysLeft} ${daysLeft === 1 ? 'день' : 'дня'}`

          const message = `${sub.productTitle} × ${sub.quantity} — ${total}. Управляйте подпиской в личном кабинете.`

          addNotification({ type: 'info', title, message, link: '/account' })
          markReminded(sub.id)
        }
      })
  }, [userId, subscriptions, addNotification, markReminded])
}
