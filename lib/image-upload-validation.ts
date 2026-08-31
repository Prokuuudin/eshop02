const IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
])

export type AllowedImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/avif'

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length))
}

export function detectImageMime(bytes: Uint8Array): AllowedImageMime | null {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG'
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) return 'image/gif'
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp'
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4)
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
  }
  return null
}

export function validateUploadedImage(bytes: Uint8Array, declaredMime: string): AllowedImageMime | null {
  if (!IMAGE_MIME_TYPES.has(declaredMime)) return null
  const detectedMime = detectImageMime(bytes)
  return detectedMime === declaredMime ? detectedMime : null
}
