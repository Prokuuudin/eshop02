import { describe, expect, it } from 'vitest'
import { detectImageMime, validateUploadedImage } from './image-upload-validation'

const bytes = (text: string) => new Uint8Array([...text].map((char) => char.charCodeAt(0)))

describe('image upload signature validation', () => {
  it.each([
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
    [new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    [bytes('GIF89a'), 'image/gif'],
    [bytes('RIFF0000WEBP'), 'image/webp'],
    [bytes('0000ftypavif'), 'image/avif'],
  ])('detects supported image signatures', (content, expected) => {
    expect(detectImageMime(content)).toBe(expected)
  })

  it('rejects a MIME mismatch even when the bytes are a valid image', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(validateUploadedImage(png, 'image/jpeg')).toBeNull()
  })

  it('rejects SVG and HTML content', () => {
    expect(validateUploadedImage(bytes('<svg><script>'), 'image/png')).toBeNull()
    expect(validateUploadedImage(bytes('<!doctype html>'), 'image/png')).toBeNull()
  })
})
