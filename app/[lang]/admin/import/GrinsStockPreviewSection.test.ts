import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Localize } from './import-config'
import { GrinsStockPreviewSection } from './GrinsStockPreviewSection'

describe('read-only stocks-only admin interface', () => {
  it('states the availability uncertainty and offers no Apply action', () => {
    const l: Localize = (ru) => ru
    const html = renderToStaticMarkup(createElement(GrinsStockPreviewSection, { l }))
    expect(html).toContain('только Preview')
    expect(html).toContain('не подтверждён как доступный для продажи')
    expect(html).toContain('Проверить остатки')
    expect(html).not.toContain('Применить')
    expect(html).not.toContain('Обновить остатки')
  })
})
