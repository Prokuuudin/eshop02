import { describe, expect, it } from 'vitest'
import {
  formatBasisPoints,
  formatEuroCents,
  getEvidenceExclusionPresentation,
  getNoRecommendationPresentation,
  getRecommendationActionPresentation,
  getSourceHealthPresentation,
} from './admin-presentation'

describe('admin pricing presentation', () => {
  it('formats cents exactly for every supported admin language', () => {
    expect(formatEuroCents(1, 'en')).toBe('€0.01')
    expect(formatEuroCents(1230, 'en')).toBe('€12.30')
    expect(formatEuroCents(999_999_999_999, 'en')).toBe('€9,999,999,999.99')
    expect(formatEuroCents(-1230, 'ru')).toBe('-12,30\u00a0€')
    expect(formatEuroCents(1230, 'lv', true)).toBe('+12,30\u00a0€')
  })

  it('formats integer basis points without float math', () => {
    expect(formatBasisPoints(125, 'en', true)).toBe('+1.25%')
    expect(formatBasisPoints(-205, 'ru', true)).toBe('-2,05%')
  })

  it('maps domain reason codes to localized admin explanations', () => {
    expect(getNoRecommendationPresentation('insufficient_competitors', 'ru')).toMatchObject({
      label: 'Недостаточно подтверждённых конкурентов',
    })
    expect(getEvidenceExclusionPresentation('outlier', 'en')).toMatchObject({ label: 'Statistical outlier' })
  })

  it('presents action and source states with text, not color alone', () => {
    expect(getRecommendationActionPresentation('erp_required', 'en')).toMatchObject({ label: 'Send to ERP' })
    expect(getRecommendationActionPresentation('local_apply', 'en')).toMatchObject({ label: 'Apply' })
    expect(getRecommendationActionPresentation('apply_blocked', 'en')).toMatchObject({ label: 'Apply unavailable' })
    expect(getSourceHealthPresentation('rate_limited', 'en')).toMatchObject({ label: 'Rate limited' })
  })

  it.each(['ok', 'stale', 'transient_error', 'rate_limited', 'blocked', 'disabled'] as const)(
    'has a textual presentation for source health %s',
    (health) => {
      expect(getSourceHealthPresentation(health, 'en').label.length).toBeGreaterThan(0)
      expect(getSourceHealthPresentation(health, 'en').description.length).toBeGreaterThan(0)
    },
  )
})
