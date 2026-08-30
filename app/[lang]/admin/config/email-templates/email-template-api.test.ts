import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadEmailTemplates, saveEmailTemplate, sendEmailTemplateTest } from './email-template-api'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('email template API', () => {
  it('normalizes an invalid template list to an empty array', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ templates: [] }) } as Response)

    await expect(loadEmailTemplates()).resolves.toEqual([])
  })

  it('saves the editable template fields and returns the server version', async () => {
    const saved = { id: 'invite-ru', name: 'Invite', subject: 'Hello', body: 'Body' }
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => saved } as Response)

    await expect(saveEmailTemplate(saved.id, saved.subject, saved.body)).resolves.toEqual(saved)
    expect(fetch).toHaveBeenCalledWith('/api/admin/email-templates/invite-ru', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ subject: 'Hello', body: 'Body' }),
    }))
  })

  it('reports test-delivery rejection without parsing a response body', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)

    await expect(sendEmailTemplateTest('invite-ru', 'admin@example.com')).resolves.toBe(false)
  })

  it('rejects failed load and save responses', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)

    await expect(loadEmailTemplates()).rejects.toThrow('load_failed')
    await expect(saveEmailTemplate('id', 'subject', 'body')).rejects.toThrow('save_failed')
  })
})
