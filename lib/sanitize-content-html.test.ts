import { describe, expect, it } from 'vitest'
import { sanitizeContentHtml } from './sanitize-content-html'

describe('sanitizeContentHtml', () => {
  it('removes executable markup and keeps ordinary legal-page HTML', () => {
    const result = sanitizeContentHtml('<h2>Terms</h2><script>alert(1)</script><p onclick="x()">Text</p><a href="javascript:x()">link</a>')
    expect(result).toContain('<h2>Terms</h2>')
    expect(result).toContain('<p>Text</p>')
    expect(result).not.toMatch(/script|onclick|javascript:/i)
  })
})
