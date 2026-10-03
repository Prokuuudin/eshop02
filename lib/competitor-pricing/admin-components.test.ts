import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CompetitorHealthTable,
  ProductPricingTable,
} from '@/components/admin/pricing/PricingDashboardShell'
import type {
  CompetitorSourceHealthDto,
  ProductPricingRowDto,
} from '@/lib/competitor-pricing/application-contracts'
import {
  recommendationDtoFromDomain,
  serializeIsoDateTime,
  serializePriceCents,
} from '@/lib/competitor-pricing/application-contracts'
import { recommendPrice, type CompetitorPriceEvidence } from '@/lib/competitor-pricing/recommendation-engine'
import { DEFAULT_PRICING_RULES } from '@/lib/competitor-pricing/settings'

const NOW = new Date('2026-10-03T12:00:00.000Z')

function evidence(): CompetitorPriceEvidence {
  return {
    observationId: 'observation-1',
    competitorId: 'competitor-1',
    competitorProductId: 'competitor-product-1',
    matchStatus: 'confirmed',
    matchMethod: 'ean',
    matchConfidenceThousandths: 980,
    regularCents: 1500,
    saleCents: null,
    currency: 'EUR',
    availability: 'in_stock',
    observedAt: new Date('2026-10-03T10:00:00.000Z'),
    lastSeenAt: new Date('2026-10-03T11:00:00.000Z'),
    competitorStatus: 'active',
    monitoringState: 'active',
    lastCheckStatus: 'ok',
  }
}

function row(actionMode: 'local_apply' | 'erp_required' | 'apply_blocked', title = 'Test product'): ProductPricingRowDto {
  const result = recommendPrice({
    now: NOW,
    product: {
      id: 'product-1',
      revision: 1,
      currentPriceCents: 2000,
      externalId: actionMode === 'erp_required' ? 'ERP-1' : null,
      erpPriceMissing: actionMode === 'apply_blocked',
    },
    evidence: [evidence()],
    rules: {
      ...DEFAULT_PRICING_RULES,
      minimumCompetitors: 1,
      minimumDifferencePercent: 0,
      maxDecreasePercent: 50,
    },
  })
  const recommendation = recommendationDtoFromDomain(result, { status: 'pending', calculatedAt: NOW })
  return {
    productId: 'product-1',
    title,
    currentPriceCents: serializePriceCents(2000),
    currency: 'EUR',
    priceOwnership: actionMode === 'erp_required' ? 'erp' : actionMode === 'apply_blocked' ? 'local_price_missing' : 'local',
    trustedCompetitorCount: 1,
    market: recommendation.market,
    recommendation,
    freshness: 'fresh',
    problemCodes: [],
  }
}

function renderProducts(rows: ProductPricingRowDto[]): string {
  return renderToStaticMarkup(React.createElement(ProductPricingTable, { rows, language: 'en' }))
}

describe('admin pricing presentational components', () => {
  it('shows an honest empty state without synthetic values', () => {
    const html = renderProducts([])
    expect(html).toContain('Product pricing data is not connected yet')
    expect(html).not.toContain('€')
  })

  it('renders one product row with semantic table headings', () => {
    const html = renderProducts([row('local_apply')])
    expect(html).toContain('<table')
    expect(html).toContain('scope="row"')
    expect(html).toContain('Test product')
    expect(html).toContain('€20.00')
  })

  it.each([
    ['erp_required', 'Send to ERP'],
    ['local_apply', 'Apply'],
    ['apply_blocked', 'Apply unavailable'],
  ] as const)('renders a disabled %s action preview', (actionMode, label) => {
    const html = renderProducts([row(actionMode)])
    expect(html).toContain(label)
    expect(html).toContain('disabled')
  })

  it('renders a structured no-recommendation reason', () => {
    const base = row('local_apply')
    const noRecommendation = recommendPrice({
      now: NOW,
      product: { id: 'product-1', revision: 1, currentPriceCents: 2000, externalId: null, erpPriceMissing: false },
      evidence: [],
      rules: DEFAULT_PRICING_RULES,
    })
    const html = renderProducts([{ ...base, recommendation: recommendationDtoFromDomain(noRecommendation) }])
    expect(html).toContain('No trusted mappings')
  })

  it('renders source health as a textual state and omits raw exceptions', () => {
    const source: CompetitorSourceHealthDto = {
      competitorId: 'competitor-1',
      name: 'Safe source',
      hostname: 'shop.example',
      enabled: true,
      health: 'rate_limited',
      operationalStatus: 'active',
      lastCheckAt: serializeIsoDateTime(NOW),
      lastSuccessAt: null,
      consecutiveFailures: 2,
      rateLimited: true,
    }
    const html = renderToStaticMarkup(React.createElement(CompetitorHealthTable, { sources: [source], language: 'en' }))
    expect(html).toContain('Rate limited')
    expect(html).toContain('Safe source')
    expect(html).not.toContain('stack')
  })

  it('escapes untrusted product titles instead of rendering HTML', () => {
    const html = renderProducts([row('local_apply', '<img src=x onerror=alert(1)>')])
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src="x"')
  })
})
