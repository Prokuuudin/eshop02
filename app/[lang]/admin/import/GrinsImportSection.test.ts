import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GrinsImportSection } from './GrinsImportSection'
import type { Localize } from './import-config'

describe('localized prices-only admin interface', () => {
  it.each([
    ['ru', 'Импорт только цен', 'Остатки, резервы'],
    ['en', 'Prices-only import', 'Stock, reservations'],
    ['lv', 'Tikai cenu imports', 'Atlikumi, rezervācijas'],
  ])('renders the permitted mode and unchanged inventory in %s', (locale, mode, inventory) => {
    const l: Localize = (ru, en, lv) => locale === 'ru' ? ru : locale === 'en' ? en : lv
    const html = renderToStaticMarkup(createElement(GrinsImportSection, { l }))
    expect(html).toContain(mode)
    expect(html).toContain(inventory)
    expect(html).not.toContain('Update prices and stock from GrinS')
    expect(html).not.toContain('Stock drops to 0')
  })
})
