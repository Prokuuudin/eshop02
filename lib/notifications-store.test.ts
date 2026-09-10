import { beforeEach, describe, expect, it } from 'vitest'
import { useNotificationsStore } from './notifications-store'

describe('notification account scope', () => {
  beforeEach(() => {
    useNotificationsStore.setState({ notifications: [], notificationOwnerId: undefined })
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
})
