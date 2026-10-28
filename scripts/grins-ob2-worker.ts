// Prepared test worker; not executed against PostgreSQL/Neon in this task.
import { readFileSync } from 'node:fs'
import { resolveGrinsEnvironment, withGrinsEnvironment, safeGrinsOperationError } from '@/lib/grins-operation-environment'
const option = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1] }
async function main() {
  const file = option('--environment-profile')
  if (!file) throw new Error('environment_registry_invalid')
  const expected = resolveGrinsEnvironment(JSON.parse(readFileSync(file, 'utf8')), 'staging', process.env.DATABASE_URL)
  if (option('--confirm-isolated-test') !== expected.instanceId) throw new Error('operator_confirmation_required')
  const { prisma } = await import('@/lib/prisma')
  const started = Date.now()
  try {
    await withGrinsEnvironment(prisma, expected, async tx => {
      const marker = await tx.keyValueSetting.findUnique({ where: { key: 'grins-ob2-test-authorized' } })
      const data = marker?.value as { instanceId?: string; synthetic?: boolean } | undefined
      if (data?.instanceId !== expected.instanceId || data.synthetic !== true) throw new Error('operator_confirmation_required')
    })
    const orders = await import('@/lib/orders-data-store')
    if (option('--release-order')) {
      await orders.updateServerOrderPayment(option('--release-order')!, { paymentStatus: 'failed' })
    } else {
      const pause = Number(option('--pause-ms') ?? 0)
      if (!Number.isInteger(pause) || pause < 0 || pause > 30_000) throw new Error('operator_confirmation_required')
      const productId = option('--product') ?? 'ob2-p0'
      const result = await orders.createServerOrder({ createdAt: new Date().toISOString(), items: [], subtotal: 0, tax: 0, delivery: 0, deliveryMethod: 'pickup', paymentMethod: 'manual', discount: 0, total: 0, firstName: 'OB2', lastName: 'Synthetic', email: 'ob2@example.invalid', phone: '000', address: 'Synthetic', city: 'Synthetic', stockReservationStatus: 'reserved', stockReservedUntil: new Date(Date.now() + 300_000).toISOString() }, async tx => {
        const product = await tx.product.findUniqueOrThrow({ where: { id: productId } })
        await tx.$queryRawUnsafe('SELECT pg_sleep($1::double precision)', pause / 1000)
        return { createdAt: new Date().toISOString(), items: [{ id: product.id, title: product.title, brand: product.brand, image: '', category: product.category, rating: 0, price: Number(product.price), stock: product.stock, quantity: 1 }], subtotal: Number(product.price), tax: 0, delivery: 0, deliveryMethod: 'pickup', paymentMethod: 'manual', discount: 0, total: Number(product.price), firstName: 'OB2', lastName: 'Synthetic', email: 'ob2@example.invalid', phone: '000', address: 'Synthetic', city: 'Synthetic', stockReservationStatus: 'reserved', stockReservedUntil: new Date(Date.now() + 300_000).toISOString() }
      })
      console.log(JSON.stringify({ event: 'ob2_order', orderId: result.id, elapsedMs: Date.now() - started, outcome: 'committed' }))
    }
  } finally { await prisma.$disconnect() }
}
main().catch(error => {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : safeGrinsOperationError(error)
  console.error(JSON.stringify({ event: 'ob2_worker_failed', code: /^[A-Z0-9]{5}$/u.test(code) ? code : safeGrinsOperationError(error) }))
  process.exitCode = 1
})
