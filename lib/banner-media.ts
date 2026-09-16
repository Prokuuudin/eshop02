export const BANNER_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const BANNER_VIDEO_MAX_BYTES = 50 * 1024 * 1024
export const BANNER_MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm'

export function isVideoSource(source: string): boolean {
  return /\.(mp4|webm)(?:[?#]|$)/i.test(source.trim())
}
