import { describe, expect, it } from 'vitest'
import { formatNotificationRelativeTime } from '@/components/account/NotificationItem'

const now = new Date('2026-08-30T12:00:00.000Z').getTime()

describe('formatNotificationRelativeTime', () => {
  it('formats recent times in all supported languages', () => {
    const fiveMinutesAgo = '2026-08-30T11:55:00.000Z'
    expect(formatNotificationRelativeTime(fiveMinutesAgo, 'ru', now)).toBe('5 мин. назад')
    expect(formatNotificationRelativeTime(fiveMinutesAgo, 'en', now)).toBe('5 min ago')
    expect(formatNotificationRelativeTime(fiveMinutesAgo, 'lv', now)).toBe('5 min. atpakaļ')
  })

  it('switches from hours to days at the expected boundaries', () => {
    expect(formatNotificationRelativeTime('2026-08-30T10:00:00.000Z', 'en', now)).toBe('2 h ago')
    expect(formatNotificationRelativeTime('2026-08-28T12:00:00.000Z', 'en', now)).toBe('2 d ago')
  })
})
