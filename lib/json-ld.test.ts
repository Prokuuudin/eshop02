import { describe, expect, it } from 'vitest'
import { serializeJsonLd } from './json-ld'

describe('serializeJsonLd', () => {
  it('cannot emit a closing script tag from dynamic data', () => {
    const result = serializeJsonLd({ name: '</script><script>alert(1)</script>', text: '&\u2028\u2029' })
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
    expect(result).not.toContain('&')
    expect(result).toContain('\\u003c/script\\u003e')
    expect(result).toContain('\\u2028')
    expect(result).toContain('\\u2029')
  })
})
