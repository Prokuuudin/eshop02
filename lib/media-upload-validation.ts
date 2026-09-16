import { validateUploadedImage } from '@/lib/image-upload-validation'

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length))
}

export function validateUploadedMedia(bytes: Uint8Array, declaredMime: string): string | null {
  if (declaredMime === 'video/mp4') {
    // ISO base media container; exclude AVIF and QuickTime image/video containers.
    const brands = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash'])
    if (bytes.length < 16 || ascii(bytes, 4, 4) !== 'ftyp') return null
    const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
    if (boxSize < 16 || boxSize > bytes.length || !brands.has(ascii(bytes, 8, 4))) return null
    return declaredMime
  }
  if (declaredMime === 'video/webm') {
    // EBML header and WebM DocType (Matroska alone is not browser-playable WebM).
    if (bytes.length < 12 || bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) return null
    const header = ascii(bytes, 0, Math.min(bytes.length, 4096))
    return header.includes('\x42\x82\x84webm') ? declaredMime : null
  }
  return validateUploadedImage(bytes, declaredMime)
}
