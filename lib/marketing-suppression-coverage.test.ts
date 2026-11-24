import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// Static guard for «Рассылки запрещены»: every marketing sender goes through
// sendMarketingEmail (checked right before SMTP), service/transactional email keeps the
// plain sendEmail, and nothing in the ERP/GrinS sync or client import can touch the list.

const root = path.resolve(__dirname, '..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

const MARKETING_SENDERS = [
  'app/api/admin/invitations/route.ts', // individual, bulk and repeated invitations
  'app/api/admin/card-rules-campaign/route.ts', // cursor-driven campaign ("how to get a card")
  'app/api/admin/broadcast/route.ts', // segment / manual broadcast
  'app/api/admin/notifications/send/route.ts', // admin mass notifications (email channel)
  'lib/product-news-notify.ts', // automatic price / restock / promo emails
]

// Must keep working for a client with the block.
const SERVICE_SENDERS = [
  'app/api/orders/route.ts', // order confirmation
  'app/api/admin/order-meta/route.ts', // order status / delivery
  'app/api/admin/orders/send-invoice/route.ts', // invoice / payment
  'app/api/admin/returns/notify/route.ts', // returns
  'app/api/auth/forgot-password/route.ts', // password recovery
  'app/api/user/email-change/route.ts', // email change confirmation
  'app/api/user/email-change/confirm/route.ts', // security notice to the old address
  'lib/card-activation.ts', // "card activated — was this you?" security notice
  'app/api/admin/access-requests/[id]/route.ts', // answer to the client's own access request
  'app/api/admin/card-request/route.ts', // answer to the client's own card request
  'app/api/contact/route.ts', // contact form
]

function filesUnder(dir: string): string[] {
  const abs = path.join(root, dir)
  return readdirSync(abs).flatMap((name) => {
    const rel = path.join(dir, name)
    if (statSync(path.join(root, rel)).isDirectory()) return filesUnder(rel)
    return /\.(ts|tsx|cjs|mjs)$/u.test(name) && !/\.test\.ts$/u.test(name) ? [rel] : []
  })
}

describe('marketing email goes through the suppression check', () => {
  it.each(MARKETING_SENDERS)('%s uses sendMarketingEmail and never the raw sendEmail', (file) => {
    const source = read(file)
    expect(source).toMatch(/sendMarketingEmail\(/u)
    expect(source).not.toMatch(/from '@\/lib\/mailer'/u)
    expect(source).not.toMatch(/\bsendEmail\(/u)
  })

  it('every sendEmail call site in app/ and lib/ is either the guard itself or a known service sender', () => {
    const callers = [...filesUnder('app'), ...filesUnder('lib')]
      .filter((file) => /\bsendEmail\(/u.test(read(file)))
      .map((file) => file.split(path.sep).join('/'))
      .filter((file) => file !== 'lib/mailer.ts' && file !== 'lib/marketing-suppression.ts')
    const known = new Set([
      ...SERVICE_SENDERS,
      'app/api/access-requests/route.ts', // staff notification about a new request
      'app/api/admin/email-templates/[id]/send-test/route.ts', // test email to the admin
      'app/api/admin/stock-alerts/send/route.ts', // internal stock report to staff
      'app/api/notifications/send-email/route.ts', // a signed-in user mails themselves
      'lib/order-admin-notification.ts', // staff order notification (outbox)
      'lib/sync/sync-alert.ts', // staff sync alert
    ])
    // A new sender must be classified here: marketing → sendMarketingEmail, service → this list.
    expect(callers.filter((file) => !known.has(file))).toEqual([])
  })

  it.each(SERVICE_SENDERS)('%s (service email) is not gated by the block', (file) => {
    const source = read(file)
    expect(source).not.toMatch(/marketing-suppression/u)
    expect(source).toMatch(/\bsendEmail\(/u)
  })
})

describe('ERP/GrinS sync and client import cannot reset the block', () => {
  const syncFiles = [
    ...filesUnder('lib/sync'),
    ...filesUnder('app/api/admin/grins-import'),
    'scripts/import-client-cards.ts',
  ]

  it.each(syncFiles.map((file) => [file]))('%s does not touch the suppression list', (file) => {
    const source = read(file)
    expect(source).not.toMatch(/marketing:optout|marketing-suppression|newsletter-store|unsubscribeFromMarketing/u)
  })

  it('only the suppression module and its known writers reference the storage key', () => {
    const writers = [...filesUnder('app'), ...filesUnder('lib'), ...filesUnder('scripts')]
      .filter((file) => read(file).includes('marketing:optout'))
      .map((file) => file.split(path.sep).join('/'))
    expect(writers).toEqual(['lib/marketing-suppression.ts'])
  })
})
