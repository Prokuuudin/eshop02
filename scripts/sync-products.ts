import { runSync } from '@/lib/sync/sync-runner'
import { prisma } from '@/lib/prisma'
import { RestPaginatedAdapter } from '@/lib/sync/adapters/rest-paginated'

async function main() {
  const erpUrl = process.env.ERP_API_URL
  const erpKey = process.env.ERP_API_KEY ?? ''

  if (!erpUrl) {
    console.error(JSON.stringify({ event: 'sync_abort', reason: 'ERP_API_URL is not set' }))
    process.exit(1)
  }

  const adapter = new RestPaginatedAdapter(erpUrl, erpKey)

  try {
    const result = await runSync(adapter, prisma, 'cron')
    console.log(JSON.stringify({ event: 'sync_complete', ...result }))
    process.exit(result.status === 'completed' ? 0 : 1)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(err => {
  console.error(JSON.stringify({ event: 'sync_fatal', error: String(err) }))
  process.exit(1)
})
