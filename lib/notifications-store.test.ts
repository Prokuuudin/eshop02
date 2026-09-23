import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationsStore } from './notifications-store'

describe('notification account scope', () => {
  beforeEach(() => {
    useNotificationsStore.setState({ notifications: [], notificationOwnerId: undefined })
    vi.restoreAllMocks()
  })

  it('keeps legacy notifications when assigning their first owner', () => {
    useNotificationsStore.getState().addNotification({ type: 'info', title: 'A', message: 'A' })
    useNotificationsStore.getState().syncNotificationScope('user-a')

    expect(useNotificationsStore.getState().notifications).toHaveLength(1)
    expect(useNotificationsStore.getState().notificationOwnerId).toBe('user-a')
  })

  it('clears persisted notifications when the browser changes account', () => {
    useNotificationsStore.setState({
      notificationOwnerId: 'user-a',
      notifications: [{
        id: 'n1', type: 'info', title: 'Private', message: 'For A',
        createdAt: new Date().toISOString(), isRead: false,
      }],
    })

    useNotificationsStore.getState().syncNotificationScope('user-b')

    expect(useNotificationsStore.getState().notifications).toEqual([])
    expect(useNotificationsStore.getState().notificationOwnerId).toBe('user-b')
  })

  it('preserves the existing local read/unread behavior', () => {
    useNotificationsStore.getState().addNotification({ type: 'info', title: 'A', message: 'A' })
    const id = useNotificationsStore.getState().notifications[0].id

    expect(useNotificationsStore.getState().unreadCount()).toBe(1)
    useNotificationsStore.getState().markRead(id)
    expect(useNotificationsStore.getState().unreadCount()).toBe(0)
    expect(useNotificationsStore.getState().notifications[0].isRead).toBe(true)
  })

  it('fetchInbox only adds app notifications and never triggers email delivery', async () => {
    vi.stubGlobal('window', {})
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      notifications: [{ type: 'info', title: 'Server', message: 'Delivered' }],
    }), { status: 200 }))

    await useNotificationsStore.getState().fetchInbox()
    vi.unstubAllGlobals()

    expect(useNotificationsStore.getState().notifications).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/notifications/inbox')
  })
})
