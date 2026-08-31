import { describe, expect, it } from 'vitest'
import { escapeHtml } from './escape-html'

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<a title="x's">&`))
      .toBe('&lt;a title=&quot;x&#039;s&quot;&gt;&amp;')
  })

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('HairShop.lv')).toBe('HairShop.lv')
  })
})
