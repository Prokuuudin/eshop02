'use client'

import { AlertTriangle, Check, CheckCircle, Info, Tag, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import type { Notification, NotificationType } from '@/lib/notifications-store'

const TYPE_CONFIG: Record<NotificationType, { icon: React.ElementType; border: string; dot: string; iconColor: string }> = {
  info: { icon: Info, border: 'border-l-primary/70', dot: 'bg-primary', iconColor: 'text-primary' },
  success: { icon: CheckCircle, border: 'border-l-emerald-400', dot: 'bg-emerald-500', iconColor: 'text-emerald-500' },
  warning: { icon: AlertTriangle, border: 'border-l-amber-400', dot: 'bg-amber-500', iconColor: 'text-amber-500' },
  promo: { icon: Tag, border: 'border-l-purple-400', dot: 'bg-purple-500', iconColor: 'text-purple-500' },
}

export function formatNotificationRelativeTime(isoString: string, language: string, now = Date.now()): string {
  const date = new Date(isoString)
  const diffMs = now - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMins < 1) return language === 'lv' ? 'tikko' : language === 'en' ? 'just now' : 'только что'
  if (diffMins < 60) return language === 'lv' ? `${diffMins} min. atpakaļ` : language === 'en' ? `${diffMins} min ago` : `${diffMins} мин. назад`
  if (diffHours < 24) return language === 'lv' ? `${diffHours} st. atpakaļ` : language === 'en' ? `${diffHours} h ago` : `${diffHours} ч. назад`
  if (diffDays < 7) return language === 'lv' ? `${diffDays} d. atpakaļ` : language === 'en' ? `${diffDays} d ago` : `${diffDays} дн. назад`
  return date.toLocaleDateString(language === 'lv' ? 'lv-LV' : language === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short' })
}

export default function NotificationItem({ notification, language, isSelected, onToggleSelect, onMarkRead, onDelete, t }: {
  notification: Notification
  language: string
  isSelected: boolean
  onToggleSelect: () => void
  onMarkRead: () => void
  onDelete: () => void
  t: (key: string, fallback?: string) => string
}): React.ReactElement {
  const config = TYPE_CONFIG[notification.type]
  const Icon = config.icon

  return (
    <div className={`notifications__item relative flex gap-3 rounded-lg border-l-4 p-4 transition-colors ${config.border} ${isSelected ? 'bg-primary/5 dark:bg-primary/10' : notification.isRead ? 'bg-card' : 'bg-muted/60'}`}>
      {!notification.isRead && !isSelected && <span className={`notifications__item-dot absolute right-3 top-3 h-2 w-2 rounded-full ${config.dot}`} aria-label={t('notifications.unread')} />}
      <div className="notifications__item-checkbox mt-0.5 shrink-0"><Checkbox checked={isSelected} onCheckedChange={onToggleSelect} aria-label={notification.title} /></div>
      <div className={`notifications__item-icon mt-0.5 shrink-0 ${config.iconColor}`}><Icon className="h-4 w-4" /></div>
      <div className="notifications__item-body min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`notifications__item-title text-sm font-semibold leading-snug ${notification.isRead ? 'text-muted-foreground' : 'text-foreground'}`}>{notification.title}</p>
          <span className="notifications__item-time shrink-0 text-[11px] text-gray-400 dark:text-gray-500">{formatNotificationRelativeTime(notification.createdAt, language)}</span>
        </div>
        <p className="notifications__item-message mt-1 text-xs leading-relaxed text-muted-foreground">{notification.message}</p>
        <div className="notifications__item-actions mt-2 flex items-center gap-3">
          {!notification.isRead && <button type="button" onClick={onMarkRead} className="notifications__item-mark-read flex items-center gap-1 text-[11px] text-primary hover:text-primary dark:text-primary dark:hover:text-primary/70"><Check className="h-3 w-3" />{t('notifications.markRead')}</button>}
          <button type="button" onClick={onDelete} className="notifications__item-delete flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"><X className="h-3 w-3" />{t('notifications.delete')}</button>
        </div>
      </div>
    </div>
  )
}
