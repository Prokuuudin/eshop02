import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import CardRequestsPanel from './CardRequestsPanel'

const hookState = vi.hoisted(() => ({
  formError: '',
  message: '',
  noCardRequests: [
    { id: 'req-1', name: 'Test Client', email: 'client@example.com', requestedAt: '2026-11-14T10:00:00.000Z' },
  ] as Array<Record<string, unknown>>,
}))

vi.mock('./useCardRequestsPanel', () => ({
  useCardRequestsPanel: () => ({
    ...hookState,
    setNoCardDrafts: () => {},
    rejectNotes: {},
    setRejectNotes: () => {},
    emailBusy: {},
    getNoCardDraft: () => ({ customerType: 'individual', companyName: '', registrationNumber: '', cardNumber: '1000' }),
    regenerateCardNumber: async () => {},
    handleApproveNoCardRequest: () => {},
    handleRejectNoCardRequest: () => {},
  }),
}))

const l = (ru: string) => ru
const render = () => renderToStaticMarkup(createElement(CardRequestsPanel, { locale: 'ru-RU', l, enabled: true }))

describe('CardRequestsPanel', () => {
  it('starts collapsed: header with count and toggle, no application forms', () => {
    hookState.formError = ''
    const html = render()
    expect(html).toContain('Заявки клиентов без карты')
    expect(html).toMatch(/<button type="button" aria-expanded="false" aria-controls="[^"]+"/)
    expect(html).toContain('Развернуть')
    expect(html).toContain('>1</span>')
    expect(html).not.toContain('Выдать карту и уведомить')
    expect(html).not.toContain('client@example.com')
  })

  it('shows a load error even while collapsed', () => {
    hookState.formError = 'Ошибка загрузки заявок'
    const html = render()
    expect(html).toMatch(/<button type="button" aria-expanded="false" aria-controls="[^"]+"/)
    expect(html).toContain('Ошибка загрузки заявок')
    hookState.formError = ''
  })
})
