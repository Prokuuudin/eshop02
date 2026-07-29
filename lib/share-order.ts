export type ShareChannel = 'email' | 'whatsapp' | 'telegram'

export function buildShareChannelUrl(channel: ShareChannel, text: string): string {
  const encoded = encodeURIComponent(text)

  switch (channel) {
    case 'email':
      return `mailto:?subject=${encoded}&body=${encoded}`
    case 'whatsapp':
      return `https://wa.me/?text=${encoded}`
    case 'telegram':
      return `https://t.me/share/url?url=&text=${encoded}`
  }
}
