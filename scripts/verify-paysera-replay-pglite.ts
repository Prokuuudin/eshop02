// Real signature + real order transactions; synthetic credentials/data only.
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { NextRequest } from 'next/server'
const schema = process.argv[2]
if (!schema) throw new Error('schema required')
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54333/postgres?sslmode=disable'
process.env.PAYSERA_CLIENT_ID = 'synthetic-client'
process.env.PAYSERA_PROJECT_ID = 'synthetic-project'
process.env.PAYSERA_CLIENT_SECRET = 'synthetic-only-not-a-real-secret'
const checks: boolean[] = []
const check = (name: string, pass: boolean) => { checks.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`) }
async function main() {
  const pg = new PGlite(); await pg.exec(readFileSync(schema, 'utf8'))
  const server = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 54333 }); await server.start()
  const { prisma: db } = await import('@/lib/prisma')
  const { createServerOrder } = await import('@/lib/orders-data-store')
  const { POST } = await import('@/app/api/webhooks/paysera/route')
  const order = () => createServerOrder({ createdAt: new Date().toISOString(), items: [{ id: 'replay-p', title: 'Synthetic', brand: 'B', image: '', category: 'hair', rating: 0, price: 10, stock: 20, quantity: 1 }], subtotal: 10, tax: 0, delivery: 0, deliveryMethod: 'pickup', paymentMethod: 'paysera', paymentProvider: 'paysera', paymentStatus: 'pending', stockReservationStatus: 'reserved', stockReservedUntil: new Date(Date.now() + 300_000).toISOString(), discount: 0, total: 10, firstName: 'Replay', lastName: 'Synthetic', email: 'replay@example.invalid', phone: '000', address: 'Synthetic', city: 'Synthetic' })
  const stock = async () => (await db.product.findUniqueOrThrow({ where: { id: 'replay-p' } })).stock
  const send = (id: string, status: string, valid = true) => {
    const body = JSON.stringify({ event: { type: 'order' }, order: { merchant_order_id: id, status } })
    const signature = createHmac('sha256', process.env.PAYSERA_CLIENT_SECRET!).update(body).digest('hex')
    return POST(new NextRequest('http://localhost/api/webhooks/paysera', { method: 'POST', headers: { 'content-type': 'application/json', 'x-paysera-signature': valid ? signature : 'invalid' }, body }))
  }
  try {
    await pg.exec(`INSERT INTO "Product"(id,title,brand,price,category,"updatedAt",stock,"isActive") VALUES ('replay-p','Synthetic','B',10,'hair',now(),20,true);
      INSERT INTO "KeyValueSetting"(key,value,"updatedAt") VALUES ('grins-prices-only-maintenance','{"checkoutClosed":false}',now());`)
    const paid = await order(), beforePaid = await stock()
    check('first signed paid notification succeeds', (await send(paid.id, 'paid')).status === 200)
    check('duplicate paid notification causes no extra stock debit', (await send(paid.id, 'paid')).status === 200 && await stock() === beforePaid)
    check('late canceled after paid cannot release committed stock', (await send(paid.id, 'canceled')).status === 200 && await stock() === beforePaid && (await db.order.findUniqueOrThrow({ where: { id: paid.id } })).paymentStatus === 'paid')
    const canceled = await order(), beforeCancel = await stock()
    check('first canceled releases one reservation', (await send(canceled.id, 'canceled')).status === 200 && await stock() === beforeCancel + 1)
    check('duplicate canceled cannot release twice', (await send(canceled.id, 'canceled')).status === 200 && await stock() === beforeCancel + 1)
    const failed = await order(), beforeFailure = await stock()
    await pg.exec(`CREATE FUNCTION replay_failure() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'synthetic replay failure'; END $$ LANGUAGE plpgsql; CREATE TRIGGER replay_failure BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION replay_failure();`)
    check('DB failure returns 500 and rolls back order/stock release', (await send(failed.id, 'canceled')).status === 500 && await stock() === beforeFailure && (await db.order.findUniqueOrThrow({ where: { id: failed.id } })).stockReservationStatus === 'reserved')
    await pg.exec('DROP TRIGGER replay_failure ON "Product"; DROP FUNCTION replay_failure();')
    check('explicit identical redelivery after repair releases once', (await send(failed.id, 'canceled')).status === 200 && await stock() === beforeFailure + 1)
    const beforeInvalid = await stock()
    check('invalid signature cannot mutate stock', (await send(failed.id, 'paid', false)).status === 401 && await stock() === beforeInvalid)
  } finally { await db.$disconnect(); await server.stop(); await pg.close() }
  console.log(JSON.stringify({ checks: checks.length, failed: checks.filter(Boolean).length !== checks.length ? checks.filter(pass => !pass).length : 0 }))
  process.exitCode = checks.every(Boolean) ? 0 : 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
