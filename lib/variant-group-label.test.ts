import { describe, expect, it } from 'vitest'
import { localizeVariantGroupName, localizeVariantLabel } from './variant-group-label'

describe('variant group labels', () => {
  it('translates known legacy group names', () => {
    expect(localizeVariantGroupName('Procents', 'ru')).toBe('Концентрация')
    expect(localizeVariantGroupName('Procents', 'en')).toBe('Concentration')
    expect(localizeVariantGroupName('SMARŽA', 'ru')).toBe('Аромат')
  })

  it('falls back to the raw name for unknown groups', () => {
    expect(localizeVariantGroupName('Mystery', 'ru')).toBe('Mystery')
  })

  it('localizes group names inside a stored label, keeping values', () => {
    expect(localizeVariantLabel('Procents: 6%, Izmērs: M-BLM', 'ru')).toBe('Концентрация: 6%, Размер: M-BLM')
  })
})
