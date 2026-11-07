import { describe, expect, it } from 'vitest'
import { redactProductPrices, stripPriceMentions } from './product-price-visibility'

describe('redactProductPrices', () => {
  it('removes direct and nested monetary catalog fields without mutating input', () => {
    const product = {
      id: 'p1',
      title: 'Shampoo',
      price: 19.99,
      oldPrice: 24.99,
      bonusRate: 5,
      discountPercent: 10,
      campaignOffers: [{ id: 'beauty', discountPercent: 20, minOrderAmount: 100 }],
      secondItemOffers: [{ id: 'second', discountPercent: 50, minOrderAmount: 0 }],
      bulkPricingTiers: [{ quantity: 10, pricePerUnit: 15 }],
      variantGroups: [{
        name: 'Size',
        options: [{ value: 'Large', priceAdjustment: 3 }],
      }],
    }

    const result = redactProductPrices(product) as Record<string, unknown>

    expect(result).not.toHaveProperty('price')
    expect(result).not.toHaveProperty('oldPrice')
    expect(result).not.toHaveProperty('bonusRate')
    expect(result).not.toHaveProperty('discountPercent')
    expect(result).not.toHaveProperty('campaignOffers')
    expect(result).not.toHaveProperty('secondItemOffers')
    expect(result).not.toHaveProperty('bulkPricingTiers')
    expect(result).not.toHaveProperty('variantGroups.0.options.0.priceAdjustment')
    expect(result).toHaveProperty('variantGroups.0.options.0.value', 'Large')
    expect(product.price).toBe(19.99)
  })

  it('removes variant adjustments from the JSON string the storefront actually stores', () => {
    const groups = [{ name: 'Base', required: true, options: [
      { value: 'XT', priceAdjustment: -42.5, image: 'https://hairshop.lv/a.png' },
      { value: 'XM', priceAdjustment: 46.04 },
    ] }]
    const product = { id: 'p1', technicalSpecs: { __variantGroupsJson: JSON.stringify(groups), Color: 'Red' } }

    const result = redactProductPrices(product)

    expect(result.technicalSpecs.__variantGroupsJson).not.toContain('priceAdjustment')
    expect(result.technicalSpecs.__variantGroupsJson).not.toContain('46.04')
    expect(JSON.parse(result.technicalSpecs.__variantGroupsJson)).toEqual([{ name: 'Base', required: true, options: [
      { value: 'XT', image: 'https://hairshop.lv/a.png' },
      { value: 'XM' },
    ] }])
    expect(result.technicalSpecs.Color).toBe('Red')
    expect(product.technicalSpecs.__variantGroupsJson).toContain('46.04')
  })

  it('drops variant data it cannot read instead of passing it on', () => {
    const result = redactProductPrices({ technicalSpecs: { __variantGroupsJson: '{"priceAdjustment": 46.04', Color: 'Red' } })
    expect(result.technicalSpecs).toEqual({ Color: 'Red' })
  })

  it('cleans every free-text field, nested too, and leaves technical values alone', () => {
    const product = {
      id: '20EUR', sku: '7.74 €', image: '/a-5-eur.png', images: ['/10 €.png'], badges: ['20 EUR'],
      demoVideo: [{ url: 'https://x.test/15-eur', title: 'Tikai 15 EUR' }],
      title: 'Krāsa', metaTitle: 'Akcija 7.74 €', metaDescription: 'Krāsa tikai par 7.74 €. Tonis 60ml.',
      technicalSpecs: { __descriptionEn: 'Great dye. Only 7,74 EUR today! Lasts long.', __descriptionLv: 'Laba krāsa.\nCena 8 eiro\nIlgi turas.' },
    }

    const result = redactProductPrices(product)

    expect(result).toMatchObject({ id: '20EUR', sku: '7.74 €', image: '/a-5-eur.png', images: ['/10 €.png'], badges: ['20 EUR'], title: 'Krāsa' })
    expect(result.demoVideo[0].url).toBe('https://x.test/15-eur')
    expect(result.demoVideo[0].title).toBe('Tikai')
    expect(result.metaTitle).toBe('Akcija')
    expect(result.metaDescription).toBe('Tonis 60ml.')
    expect(result.technicalSpecs.__descriptionEn).toBe('Great dye. Lasts long.')
    expect(result.technicalSpecs.__descriptionLv).toBe('Laba krāsa.\nIlgi turas.')
  })
})

describe('stripPriceMentions', () => {
  it.each([
    ['LV', 'Matu krāsa tikai par 7.74 €. Matu krāsa 60ml.', 'Matu krāsa 60ml.'],
    ['LV word', 'Cena 12 eiro. Ilgnoturīga.', 'Ilgnoturīga.'],
    ['RU', 'Краска всего за 7,74 €. Объём 60 мл.', 'Объём 60 мл.'],
    ['RU word', 'Цена 15 евро. Стойкая.', 'Стойкая.'],
    ['EN', 'Only €7.74 today. Lasts long.', 'Lasts long.'],
    ['EN code first', 'Now EUR 7.74. Lasts long.', 'Lasts long.'],
    ['thousands', 'Komplekts 1 250,50 €. Profesionāls.', 'Profesionāls.'],
    ['html entity', 'Tikai 7.74 &euro;. Tonis 60ml.', 'Tonis 60ml.'],
    ['upper case', 'SALE 10 EUR! Great.', 'Great.'],
  ])('removes the sentence with the amount: %s', (_name, input, expected) => {
    expect(stripPriceMentions(input)).toBe(expected)
  })

  it.each([
    ['one sentence, amount after', '10,28 € Описание', 'Описание'],
    ['a code holding the amount', 'DAV20EUR', 'DAV'],
    ['only the amount', '7.74 €', ''],
    ['thousands with a no-break space', '1\u00a0250,50 € Komplekts', 'Komplekts'],
  ])('keeps the rest when the whole text is one sentence: %s', (_name, input, expected) => {
    expect(stripPriceMentions(input)).toBe(expected)
  })

  // All of these exist in the production catalog or are close to it: none of them is a price.
  it.each([
    'KERASTASE CURL MANIFESTO BAIN HYDRATION Douceur 250ML šampūns',
    'KERASTASE GENESIS FONDANT RENFORCATEUR 200ML',
    'AC adapter 110 - 240 V with 3 meter cord Euro Plug',
    'Griezēju diametrs no 2,32 līdz 2,35 mm',
    'Euro standard 5, 2.50 ml, 100%, 60ml, pH 5.5',
    'Coiffeur 2024 edition',
    'Stuff from Europe 2020',
    'Series 200 Europe edition',
  ])('leaves text without a price untouched: %s', (input) => {
    expect(stripPriceMentions(input)).toBe(input)
  })

  it('gives the same answer on repeated calls', () => {
    expect(stripPriceMentions('7.74 € a')).toBe(stripPriceMentions('7.74 € a'))
    expect(stripPriceMentions('b')).toBe('b')
  })
})
