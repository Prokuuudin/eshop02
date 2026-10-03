import { AlertCircle, DatabaseZap, Link2, PackageSearch, RadioTower } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  CompetitorSourceHealthDto,
  PricingDashboardDto,
  ProductPricingRowDto,
  SourceHealthState,
} from '@/lib/competitor-pricing/application-contracts'
import {
  formatBasisPoints,
  formatEuroCents,
  formatIsoDateTime,
  getAdminPricingCopy,
  getFreshnessLabel,
  getNoRecommendationPresentation,
  getRecommendationActionPresentation,
  getRecommendationStatusLabel,
  getSourceHealthPresentation,
  type AdminPricingLanguage,
} from '@/lib/competitor-pricing/admin-presentation'

const healthClasses: Record<SourceHealthState, string> = {
  ok: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200',
  stale: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200',
  transient_error: 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200',
  rate_limited: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-200',
  blocked: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200',
  disabled: 'border-border bg-muted text-muted-foreground',
}

function RecommendationCell({ row, language }: { row: ProductPricingRowDto; language: AdminPricingLanguage }): React.ReactElement {
  const recommendation = row.recommendation
  if (!recommendation) return <span className="text-muted-foreground">—</span>
  if (recommendation.outcome === 'no_recommendation') {
    const reason = getNoRecommendationPresentation(recommendation.reasonCode, language)
    return (
      <div className="max-w-52">
        <p className="font-medium text-foreground">{reason.label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{reason.description}</p>
      </div>
    )
  }
  return (
    <div className="whitespace-nowrap">
      <p className="font-semibold text-foreground">{formatEuroCents(recommendation.recommendedPriceCents, language)}</p>
      <p className="text-xs text-muted-foreground">
        {formatEuroCents(recommendation.differenceCents, language, true)} · {formatBasisPoints(recommendation.differenceBasisPoints, language, true)}
      </p>
    </div>
  )
}

export function ProductPricingTable({
  rows,
  language,
}: {
  rows: ProductPricingRowDto[]
  language: AdminPricingLanguage
}): React.ReactElement {
  const copy = getAdminPricingCopy(language)
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center" role="status">
        <PackageSearch aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-medium text-foreground">{copy.table.emptyTitle}</p>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{copy.table.emptyDescription}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[980px] text-sm">
        <caption className="sr-only">{copy.table.caption}</caption>
        <thead className="border-b border-border bg-muted">
          <tr>
            {[copy.table.product, copy.table.currentPrice, copy.table.market, copy.table.competitors, copy.table.recommendation, copy.table.status, copy.table.action].map((label) => (
              <th key={label} scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const recommendation = row.recommendation
            const action = recommendation?.outcome === 'recommendation'
              ? getRecommendationActionPresentation(recommendation.actionMode, language)
              : null
            return (
              <tr key={row.productId}>
                <th scope="row" className="px-4 py-4 text-left font-medium text-foreground">
                  <span className="block max-w-64">{row.title}</span>
                  <span className="mt-1 block font-mono text-xs font-normal text-muted-foreground">{row.productId}</span>
                </th>
                <td className="px-4 py-4 whitespace-nowrap">{formatEuroCents(row.currentPriceCents, language)}</td>
                <td className="px-4 py-4">
                  {row.market ? (
                    <span className="whitespace-nowrap">
                      {copy.table.median}: {formatEuroCents(row.market.medianCents, language)}
                      <span className="block text-xs text-muted-foreground">{copy.table.minimum}: {formatEuroCents(row.market.minCents, language)}</span>
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-4 tabular-nums">{row.trustedCompetitorCount}</td>
                <td className="px-4 py-4"><RecommendationCell row={row} language={language} /></td>
                <td className="px-4 py-4">
                  <span className="block font-medium text-foreground">
                    {recommendation ? getRecommendationStatusLabel(recommendation.status, language) : getFreshnessLabel(row.freshness, language)}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{getFreshnessLabel(row.freshness, language)}</span>
                </td>
                <td className="px-4 py-4">
                  {action ? (
                    <div>
                      <Button type="button" size="sm" variant="outline" disabled title={action.description}>{action.label}</Button>
                      <span className="sr-only">{copy.table.actionPreview}</span>
                    </div>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function CompetitorHealthTable({
  sources,
  language,
}: {
  sources: CompetitorSourceHealthDto[]
  language: AdminPricingLanguage
}): React.ReactElement {
  const copy = getAdminPricingCopy(language)
  if (sources.length === 0) {
    return <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground" role="status">{copy.sourceTable.empty}</div>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[680px] text-sm">
        <caption className="sr-only">{copy.sourceTable.caption}</caption>
        <thead className="border-b border-border bg-muted">
          <tr>
            <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">{copy.sourceTable.source}</th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">{copy.sourceTable.health}</th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">{copy.sourceTable.lastCheck}</th>
            <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">{copy.sourceTable.failures}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sources.map((source) => {
            const health = getSourceHealthPresentation(source.health, language)
            return (
              <tr key={source.competitorId}>
                <th scope="row" className="px-4 py-4 text-left">
                  <span className="block font-medium text-foreground">{source.name}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{source.hostname}</span>
                </th>
                <td className="px-4 py-4">
                  <Badge variant="outline" className={healthClasses[source.health]}>{health.label}</Badge>
                  <span className="mt-1 block max-w-72 text-xs text-muted-foreground">{health.description}</span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">{source.lastCheckAt ? formatIsoDateTime(source.lastCheckAt, language) : '—'}</td>
                <td className="px-4 py-4 text-right tabular-nums">{source.consecutiveFailures}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function PricingDashboardShell({
  dashboard,
  language,
}: {
  dashboard: PricingDashboardDto
  language: AdminPricingLanguage
}): React.ReactElement {
  const copy = getAdminPricingCopy(language)
  const summaryEntries = Object.entries(copy.summaryLabels) as Array<[keyof typeof dashboard.summary, string]>

  return (
    <main className="w-full space-y-8 py-4 text-foreground">
      <header>
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{copy.description}</p>
      </header>

      {dashboard.connectionState !== 'connected' && (
        <section aria-labelledby="pricing-connection-title" className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-start gap-3">
            <DatabaseZap aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 id="pricing-connection-title" className="font-semibold">{copy.statusTitle}</h2>
              <p className="mt-1 text-sm">{copy.statusDescription}</p>
              <p className="mt-1 text-sm">{copy.noFakeData}</p>
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="pricing-summary-title" className="space-y-3">
        <h2 id="pricing-summary-title" className="text-xl font-semibold">{copy.summaryTitle}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summaryEntries.map(([key, label]) => (
            <Card key={key} className="shadow-sm">
              <CardHeader className="p-4 pb-2"><CardDescription>{label}</CardDescription></CardHeader>
              <CardContent className="p-4 pt-0"><p className="text-2xl font-semibold tabular-nums">{dashboard.summary[key] ?? copy.unavailableValue}</p></CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-label={copy.futureSection} className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { icon: PackageSearch, title: copy.productsTitle, description: copy.productsDescription },
          { icon: RadioTower, title: copy.sourcesTitle, description: copy.sourcesDescription },
          { icon: Link2, title: copy.mappingsTitle, description: copy.mappingsDescription },
        ].map(({ icon: Icon, title, description }) => (
          <Card key={title} className="shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2"><Icon aria-hidden="true" className="h-5 w-5 text-primary" /><CardTitle className="text-base">{title}</CardTitle></div>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent><Badge variant="secondary">{copy.futureSection}</Badge></CardContent>
          </Card>
        ))}
      </section>

      <section aria-labelledby="pricing-products-title" className="space-y-3">
        <div>
          <h2 id="pricing-products-title" className="text-xl font-semibold">{copy.productsTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.productsDescription}</p>
        </div>
        <ProductPricingTable rows={dashboard.products} language={language} />
      </section>

      <section aria-labelledby="pricing-sources-title" className="space-y-3">
        <div>
          <h2 id="pricing-sources-title" className="text-xl font-semibold">{copy.sourcesTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.sourcesDescription}</p>
        </div>
        <CompetitorHealthTable sources={dashboard.sources} language={language} />
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground"><AlertCircle aria-hidden="true" className="h-4 w-4" />{copy.table.actionPreview}</p>
    </main>
  )
}
