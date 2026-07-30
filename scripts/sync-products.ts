import { runSync } from '@/lib/sync/sync-runner'
import { prisma } from '@/lib/prisma'
import { GrinsXmlAdapter } from '@/lib/sync/adapters/grins-xml'

async function main() {
  const adapter = new GrinsXmlAdapter()

  try {
    const result = await runSync(adapter, prisma, 'manual')
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
