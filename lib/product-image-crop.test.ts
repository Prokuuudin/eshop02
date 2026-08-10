import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { cropProductImage, loadProductImage } from './product-image-crop'

describe('cropProductImage', () => {
  it('removes large white margins and keeps padding around content', async () => {
    const source = await sharp({
      create: { width: 500, height: 500, channels: 3, background: '#ffffff' },
    }).composite([{ input: { create: { width: 100, height: 200, channels: 3, background: '#111111' } }, left: 200, top: 150 }]).png().toBuffer()

    const result = await cropProductImage(source)

    expect(result.skipped).toBe(false)
    expect(result.sourceWidth).toBe(500)
    expect(result.sourceHeight).toBe(500)
    expect(result.crop).toEqual({ left: 194, top: 138, width: 112, height: 224 })
    const metadata = await sharp(result.buffer).metadata()
    expect(metadata.width).toBe(112)
    expect(metadata.height).toBe(224)
  })

  it('does not rewrite an image that already fills the frame', async () => {
    const source = await sharp({
      create: { width: 100, height: 100, channels: 3, background: '#ffffff' },
    }).composite([{ input: { create: { width: 98, height: 98, channels: 3, background: '#111111' } }, left: 1, top: 1 }]).png().toBuffer()

    const result = await cropProductImage(source)

    expect(result.skipped).toBe(true)
    expect(result.reason).toContain('уже плотно')
  })
})

describe('loadProductImage', () => {
  it('reads internal media without making an HTTP request', async () => {
    const expected = Buffer.from('image')
    const result = await loadProductImage('/api/media/example.png', async (name) => name === 'example.png' ? expected : null)
    expect(result).toEqual(expected)
  })

  it('rejects untrusted remote hosts', async () => {
    await expect(loadProductImage('https://127.0.0.1/private.png', async () => null))
      .rejects.toThrow('not allowed')
  })
})
