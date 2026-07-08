import { describe, it, expect } from 'vitest'
import { buildShareLinks } from './share-links'

describe('buildShareLinks', () => {
  const url = 'https://eshop02.vercel.app/product/13011'
  const title = 'Shampoo 250ml'
  // encodeURIComponent(url) -> 'https%3A%2F%2Feshop02.vercel.app%2Fproduct%2F13011'
  // encodeURIComponent(title) -> 'Shampoo%20250ml'

  it('builds a Facebook sharer link with the encoded URL', () => {
    const links = buildShareLinks(url, title)
    expect(links.facebook).toBe(
      'https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Feshop02.vercel.app%2Fproduct%2F13011'
    )
  })

  it('builds an X intent link with encoded URL and title', () => {
    const links = buildShareLinks(url, title)
    expect(links.x).toBe(
      'https://twitter.com/intent/tweet?url=https%3A%2F%2Feshop02.vercel.app%2Fproduct%2F13011&text=Shampoo%20250ml'
    )
  })

  it('builds a Telegram share link with encoded URL and title', () => {
    const links = buildShareLinks(url, title)
    expect(links.telegram).toBe(
      'https://t.me/share/url?url=https%3A%2F%2Feshop02.vercel.app%2Fproduct%2F13011&text=Shampoo%20250ml'
    )
  })

  it('builds a WhatsApp link combining title and URL in one encoded text param', () => {
    const links = buildShareLinks(url, title)
    expect(links.whatsapp).toBe(
      'https://wa.me/?text=Shampoo%20250ml%20https%3A%2F%2Feshop02.vercel.app%2Fproduct%2F13011'
    )
  })

  it('percent-encodes reserved characters (&, spaces) in the title', () => {
    const links = buildShareLinks('https://x.test/p', 'Sale & Deals')
    expect(links.x).toBe(
      'https://twitter.com/intent/tweet?url=https%3A%2F%2Fx.test%2Fp&text=Sale%20%26%20Deals'
    )
  })
})
