import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hydrateSavedAddressesFromServer } from './saved-addresses-store'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('hydrateSavedAddressesFromServer', () => {
  it('replaces the local addresses for this email with what the server returns', async () => {
    const serverAddresses = [
      { id: 'a1', firstName: 'Ivan', lastName: 'Ivanov', email: 'a@b.com', phone: '+371', address: 'Str 1', city: 'Riga' },
    ]
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ addresses: serverAddresses }),
    } as Response)
    const replaceForEmail = vi.fn()

    await hydrateSavedAddressesFromServer('a@b.com', replaceForEmail)

    expect(fetch).toHaveBeenCalledWith('/api/user/addresses')
    expect(replaceForEmail).toHaveBeenCalledWith('a@b.com', serverAddresses)
  })

  it('leaves the local store untouched when the request fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))
    const replaceForEmail = vi.fn()

    await hydrateSavedAddressesFromServer('a@b.com', replaceForEmail)

    expect(replaceForEmail).not.toHaveBeenCalled()
  })

  it('leaves the local store untouched on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response)
    const replaceForEmail = vi.fn()

    await hydrateSavedAddressesFromServer('a@b.com', replaceForEmail)

    expect(replaceForEmail).not.toHaveBeenCalled()
  })
})
