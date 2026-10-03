import PricingDashboardShell from '@/components/admin/pricing/PricingDashboardShell'
import { createDisconnectedPricingDashboard } from '@/lib/competitor-pricing/application-contracts'
import { resolveLanguage } from '@/lib/i18n-routing'

export default async function AdminPricingPage({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<React.ReactElement> {
  const language = resolveLanguage((await params).lang)
  const dashboard = createDisconnectedPricingDashboard()
  return <PricingDashboardShell dashboard={dashboard} language={language} />
}
