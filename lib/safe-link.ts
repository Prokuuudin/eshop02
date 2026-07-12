/**
 * Ссылки из БД (баннеры, контент-блоки) редактируются в админке и не
 * валидируются на запись. Перед рендером в <a href> пропускаем только
 * внутренние пути и явные http(s)-URL; javascript:, data:, vbscript:,
 * протокол-относительные `//` и `/\` (браузеры трактуют `\` как `/`)
 * превращаются в пустую строку.
 */
export function sanitizeStoredLink(link: unknown): string {
  if (typeof link !== 'string') return ''
  const trimmed = link.trim()
  if (/^\/(?![/\\])/.test(trimmed)) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return ''
}
