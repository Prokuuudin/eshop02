import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: mocks.audit }))

import { saveSiteContentOverridesToStore, type SiteContentOverrides } from './site-content-server-store'

const actor = { id: 'admin-1', email: 'admin@hairshop.test', name: 'Administrator' } as never
const request = new NextRequest('https://shop.test/api/admin/content', { method: 'PUT' })

function value(title: string): SiteContentOverrides {
  return {
    text: { ru: { 'home.hero.title': title }, en: {}, lv: {} },
    images: { 'home.hero': '/hero.jpg' },
  }
}

describe('site content persistent audit', () => {
  let committed: SiteContentOverrides
  let tx: {
    $executeRaw: ReturnType<typeof vi.fn>
    keyValueSetting: {
      findUnique: ReturnType<typeof vi.fn>
      upsert: ReturnType<typeof vi.fn>
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    committed = value('Before')
    tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      keyValueSetting: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    }
    mocks.transaction.mockImplementation(async (run: (client: typeof tx) => Promise<SiteContentOverrides>) => {
      let staged = structuredClone(committed)
      tx.keyValueSetting.findUnique.mockImplementation(async () => ({ key: 'site-content', value: structuredClone(staged) }))
      tx.keyValueSetting.upsert.mockImplementation(async ({ update }: { update: { value: SiteContentOverrides } }) => {
        staged = structuredClone(update.value)
        return { key: 'site-content', value: staged }
      })
      const result = await run(tx)
      committed = staged
      return result
    })
  })

  it('stores the change and records only changed keys, language, and before/after values', async () => {
    await saveSiteContentOverridesToStore(value('After'), actor, request)

    expect(committed.text.ru?.['home.hero.title']).toBe('After')
    expect(mocks.audit).toHaveBeenCalledWith(tx, request, actor, expect.objectContaining({
      action: 'site_content.updated',
      entityType: 'setting',
      entityId: 'site-content',
      before: {
        text: [{ language: 'ru', key: 'home.hero.title', value: 'Before' }],
        images: [],
      },
      after: {
        text: [{ language: 'ru', key: 'home.hero.title', value: 'After' }],
        images: [],
      },
    }))
  })

  it('does not write or duplicate the audit event when the payload changes nothing', async () => {
    await saveSiteContentOverridesToStore(value('Before'), actor, request)

    expect(tx.keyValueSetting.upsert).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('rolls back the content value when the audit append fails', async () => {
    mocks.audit.mockRejectedValueOnce(new Error('audit unavailable'))

    await expect(saveSiteContentOverridesToStore(value('After'), actor, request))
      .rejects.toThrow('audit unavailable')
    expect(committed.text.ru?.['home.hero.title']).toBe('Before')
  })
})
