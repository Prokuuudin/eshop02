// Клиентская подготовка файла сертификата к отправке: фото ужимается канвасом
// до разумного data URL (телефонные снимки 5-8 МБ → ~100-300 КБ), PDF идёт как
// есть. Лимит согласован с сервером (MAX_CERT_DATA_LENGTH в certificate-store).

export const MAX_UPLOAD_DATA_LENGTH = 2_000_000
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.8

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('file_read_error'))
    reader.readAsDataURL(file)
  })

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image_decode_error'))
    img.src = src
  })

/**
 * Файл → data URL, пригодный к отправке. Изображения пересжимаются в JPEG,
 * прочее (PDF) проходит как есть. Бросает Error('file_too_large'), если после
 * подготовки не влезает в лимит.
 */
export async function prepareCertificateDataUrl(file: File): Promise<string> {
  const raw = await readAsDataUrl(file)

  if (!file.type.startsWith('image/')) {
    if (raw.length > MAX_UPLOAD_DATA_LENGTH) throw new Error('file_too_large')
    return raw
  }

  try {
    const img = await loadImage(raw)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas_unavailable')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const compressed = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    if (compressed.length > MAX_UPLOAD_DATA_LENGTH) throw new Error('file_too_large')
    return compressed
  } catch (e) {
    if ((e as Error).message === 'file_too_large') throw e
    // HEIC и прочие форматы, которые браузер не декодирует — отправляем как есть
    if (raw.length > MAX_UPLOAD_DATA_LENGTH) throw new Error('file_too_large')
    return raw
  }
}
