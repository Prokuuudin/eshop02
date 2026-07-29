import { describe, it, expect } from 'vitest'
import { buildShareChannelUrl } from './share-order'

describe('buildShareChannelUrl', () => {
  const text = 'hairshop-pro.lv — заказ №1234, сумма 45,90 €'

  it('builds a mailto link with the text as both subject and body', () => {
    const url = buildShareChannelUrl('email', text)
    expect(url).toBe(
      `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(text)}`
    )
  })

  it('builds a wa.me link with the encoded text', () => {
    const url = buildShareChannelUrl('whatsapp', text)
    expect(url).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`)
  })

  it('builds a Telegram share link with an empty url param and the encoded text', () => {
    const url = buildShareChannelUrl('telegram', text)
    expect(url).toBe(`https://t.me/share/url?url=&text=${encodeURIComponent(text)}`)
  })

  it('percent-encodes reserved characters (&, #, spaces) correctly', () => {
    const url = buildShareChannelUrl('whatsapp', 'Order #1 & Order #2')
    expect(url).toBe('https://wa.me/?text=Order%20%231%20%26%20Order%20%232')
  })
})
