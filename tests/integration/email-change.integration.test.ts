import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { NextRequest } from 'next/server'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

// Real route handlers and real SQL on an in-memory PostgreSQL bound to loopback. Mail is captured.
const { mail, jar } = vi.hoisted(() => ({
  mail: [] as Array<{ to: string; subject: string; html: string }>,
  jar: { session: undefined as string | undefined },
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => undefined, revalidatePath: () => undefined }))
vi.mock('@/lib/mailer', () => ({ sendEmail: async (to: string, subject: string, html: string) => { mail.push({ to, subject, html }) } }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'eshop_session' && jar.session ? { value: jar.session } : undefined) }),
}))

const ORIGIN = 'http://localhost'
const PASSWORD = 'current-password-1'

let pg: PGlite
let socket: PGLiteSocketServer
let db: typeof import('@/lib/prisma').prisma
let hash: string
let serial = 500_000

let requestChange: typeof import('@/app/api/user/email-change/route').POST
let confirmRoute: typeof import('@/app/api/user/email-change/confirm/route')
let profile: typeof import('@/app/api/user/profile/route').PATCH
let login: typeof import('@/app/api/auth/login/route').POST
let forgot: typeof import('@/app/api/auth/forgot-password/route').POST
let reset: typeof import('@/app/api/auth/reset-password/route').POST
let myOrders: typeof import('@/app/api/orders/my/route').GET
let createSession: typeof import('@/lib/server-auth').createSession
let anonymizeUser: typeof import('@/lib/user-erasure').anonymizeUser

const freePort = (): Promise<number> => new Promise((resolve) => {
  const probe = createServer()
  probe.listen(0, '127.0.0.1', () => { const p = (probe.address() as { port: number }).port; probe.close(() => resolve(p)) })
})
const nextIp = (): string => `198.51.${Math.floor(serial / 250) % 250}.${serial % 250}`
const http = (url: string, method: string, body?: unknown, ip = nextIp()): NextRequest => new NextRequest(`${ORIGIN}${url}`, {
  method,
  headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': ip, ...(jar.session ? { cookie: `eshop_session=${jar.session}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})
const ask = (newEmail: string, currentPassword = PASSWORD, ip?: string) => {
  serial += 1
  return requestChange(http('/api/user/email-change', 'POST', { newEmail, currentPassword, language: 'lv' }, ip))
}
const confirm = (token: string) => {
  serial += 1
  return confirmRoute.POST(http('/api/user/email-change/confirm', 'POST', { token }))
}
const account = async (overrides: { email?: string; platformRole?: string; mustChangePassword?: boolean; mfaEnabled?: boolean; teamRole?: string; superAdmin?: boolean } = {}) => {
  serial += 1
  return db.user.create({
    data: {
      id: `user-${serial}`, email: overrides.email ?? `user-${serial}@example.test`, passwordHash: hash, name: `Name ${serial}`, phone: '+37120000000',
      cardNumber: String(serial), platformRole: overrides.platformRole ?? 'customer', mustChangePassword: overrides.mustChangePassword ?? false,
      mfaEnabled: overrides.mfaEnabled ?? false, mfaSecret: overrides.mfaEnabled ? 'encrypted-secret' : null, teamRole: overrides.teamRole ?? null,
      superAdmin: overrides.superAdmin ?? false, bonusPoints: 777,
    },
  })
}
const signIn = async (userId: string, mfaVerified = false): Promise<string> => {
  const token = await createSession(userId, { mfaVerified })
  jar.session = token
  return token
}
const emailOf = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).email
const tokenInMail = (html: string): string => {
  const match = /token=([A-Za-z0-9_.%-]+)/.exec(html)
  if (!match) throw new Error('no token in mail')
  return decodeURIComponent(match[1])
}
const linkFor = async (to: string): Promise<string> => {
  await vi.waitFor(() => expect(mail.filter((m) => m.to === to).length).toBeGreaterThan(0), { timeout: 5000 })
  return tokenInMail(mail.filter((m) => m.to === to).at(-1)!.html)
}
const bodyOf = async (res: Response) => ({ status: res.status, body: await res.json() as unknown })
const INVALID = { status: 400, body: { error: 'invalid_link' } }

beforeAll(async () => {
  const port = await freePort()
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
  process.env.DATABASE_URL = url
  process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.test'
  const dir = mkdtempSync(path.join(tmpdir(), 'email-change-'))
  const file = path.join(dir, 'schema.sql')
  execFileSync(process.execPath, [path.join('node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', path.join('prisma', 'schema.prisma'), '--script', '--output', file], { stdio: 'ignore', env: { ...process.env, DATABASE_URL: url } })
  pg = new PGlite()
  await pg.exec(readFileSync(file, 'utf8'))
  rmSync(dir, { recursive: true, force: true })
  socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port, maxConnections: 20 })
  await socket.start()

  db = (await import('@/lib/prisma')).prisma
  requestChange = (await import('@/app/api/user/email-change/route')).POST
  confirmRoute = await import('@/app/api/user/email-change/confirm/route')
  profile = (await import('@/app/api/user/profile/route')).PATCH
  login = (await import('@/app/api/auth/login/route')).POST
  forgot = (await import('@/app/api/auth/forgot-password/route')).POST
  reset = (await import('@/app/api/auth/reset-password/route')).POST
  myOrders = (await import('@/app/api/orders/my/route')).GET
  createSession = (await import('@/lib/server-auth')).createSession
  anonymizeUser = (await import('@/lib/user-erasure')).anonymizeUser
  hash = await bcrypt.hash(PASSWORD, 4)
}, 120_000)

afterAll(async () => { await db?.$disconnect(); await socket?.stop(); await pg?.close() })
beforeEach(async () => {
  mail.length = 0
  jar.session = undefined
  await db.rateLimit.deleteMany({})
})

describe('PATCH /api/user/profile', () => {
  it('cannot change the e-mail any more', async () => {
    const user = await account()
    await signIn(user.id)

    const res = await profile(http('/api/user/profile', 'PATCH', { email: 'direct@example.test' }))

    expect(res.status).toBe(409)
    expect(await emailOf(user.id)).toBe(user.email)
  })
})

describe('requesting a change', () => {
  it('needs a session, and refuses a not-activated customer', async () => {
    expect((await ask('a@example.test')).status).toBe(401)
    const dormant = await account({ mustChangePassword: true })
    await signIn(dormant.id)
    expect((await ask('a@example.test')).status).toBe(401)
    expect(await db.keyValueSetting.count({ where: { key: `email-change:${dormant.id}` } })).toBe(0)
  })

  it('needs an MFA-verified session from staff', async () => {
    const admin = await account({ platformRole: 'admin', mfaEnabled: true })
    await signIn(admin.id, false)
    expect((await ask(`staff-${serial}@example.test`)).status).toBe(401)
    await signIn(admin.id, true)
    expect((await ask(`staff-${serial}@example.test`)).status).toBe(202)
  })

  it('needs the current password: a wrong one sends nothing and stores nothing', async () => {
    const user = await account()
    await signIn(user.id)

    const res = await ask('new@example.test', 'wrong-password')

    expect(await bodyOf(res)).toEqual({ status: 401, body: { error: 'reauthentication_failed' } })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mail).toHaveLength(0)
    expect(await db.keyValueSetting.count({ where: { key: `email-change:${user.id}` } })).toBe(0)
  })

  it('mails only the new address, changes nothing yet and stores only a hash of the token', async () => {
    const user = await account()
    await signIn(user.id)
    const target = `new-${serial}@example.test`

    expect(await bodyOf(await ask(target))).toEqual({ status: 202, body: { ok: true } })

    const token = await linkFor(target)
    expect(mail.map((m) => m.to)).toEqual([target])
    expect(mail[0].html).toContain('/lv/auth/confirm-email?token=')
    expect(await emailOf(user.id)).toBe(user.email)
    const row = await db.keyValueSetting.findUniqueOrThrow({ where: { key: `email-change:${user.id}` } })
    const stored = JSON.stringify(row.value)
    expect(stored).not.toContain(token)
    expect(stored).not.toContain(token.split('.')[1])
    const expiresIn = new Date((row.value as { expiresAt: string }).expiresAt).getTime() - Date.now()
    expect(expiresIn).toBeGreaterThan(59 * 60 * 1000)
    expect(expiresIn).toBeLessThanOrEqual(60 * 60 * 1000)
  })

  it('refuses malformed, synthetic and unchanged addresses', async () => {
    const user = await account()
    await signIn(user.id)
    for (const value of ['nope', 'x@client.local', 'x@deleted.invalid', `${'a'.repeat(250)}@example.test`]) {
      expect(await bodyOf(await ask(value))).toEqual({ status: 400, body: { error: 'invalid_email' } })
    }
    expect(await bodyOf(await ask(user.email.toUpperCase()))).toEqual({ status: 400, body: { error: 'email_unchanged' } })
  })

  it('limits per user, including wrong passwords', async () => {
    const user = await account()
    await signIn(user.id)
    for (let i = 0; i < 5; i += 1) expect((await ask(`u${i}-${serial}@example.test`, 'wrong')).status).toBe(401)
    expect((await ask(`u9-${serial}@example.test`)).status).toBe(429)
  })

  it('limits per target address across accounts', async () => {
    const target = `target-${serial}@example.test`
    for (let i = 0; i < 3; i += 1) {
      const user = await account()
      await signIn(user.id)
      expect((await ask(target)).status).toBe(202)
    }
    const another = await account()
    await signIn(another.id)
    expect((await ask(target)).status).toBe(429)
  })

  it('limits per IP across accounts', async () => {
    const ip = '192.0.2.77'
    let accepted = 0
    for (let u = 0; u < 5; u += 1) {
      const user = await account()
      await signIn(user.id)
      for (let i = 0; i < 5 && accepted < 20; i += 1) {
        expect((await ask(`ip${u}${i}-${serial}@example.test`, PASSWORD, ip)).status).toBe(202)
        accepted += 1
      }
    }
    expect(accepted).toBe(20)
    const user = await account()
    await signIn(user.id)
    expect((await ask(`ip-last-${serial}@example.test`, PASSWORD, ip)).status).toBe(429)
  })

  it('answers identically for a free and a taken address, in any letter case, and mails no one', async () => {
    const other = await account({ email: `Owner.Mixed-${serial}@Example.TEST` })
    const user = await account()
    await signIn(user.id)

    const freeAddress = `free-${serial}@example.test`
    const free = await bodyOf(await ask(freeAddress))
    await linkFor(freeAddress)
    mail.length = 0

    const taken = await bodyOf(await ask(other.email.toLowerCase()))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(taken).toEqual(free)
    expect(mail).toHaveLength(0)
    expect(await db.keyValueSetting.count({ where: { key: `email-change:${user.id}` } })).toBe(1)
  })
})

describe('opening the link', () => {
  it('has no GET: only the POST can change anything', () => {
    expect((confirmRoute as Record<string, unknown>).GET).toBeUndefined()
    expect((confirmRoute as Record<string, unknown>).HEAD).toBeUndefined()
  })
})

describe('confirming', () => {
  async function pendingFor() {
    const user = await account()
    const device = await signIn(user.id)
    const target = `confirm-${serial}@example.test`
    expect((await ask(target)).status).toBe(202)
    return { user, device, target, token: await linkFor(target) }
  }

  it('updates the account and its own records, ends other sessions and keeps this one', async () => {
    const { user, device, target, token } = await pendingFor()
    const company = `company-${serial}`
    const ownAddress = `sa-own-${serial}`
    await db.company.create({ data: { id: company, companyName: 'C' } })
    await db.companyMember.create({ data: { id: `cm-${serial}`, companyId: company, userId: user.id, email: user.email, name: 'N', role: 'admin', addedBy: 'test' } })
    const stranger = await account()
    await db.savedAddress.createMany({ data: [
      { id: ownAddress, userId: user.id, email: user.email, firstName: 'A', lastName: 'B', phone: '1', address: 'x', city: 'y' },
      { id: `sa-other-${serial}`, userId: stranger.id, email: stranger.email, firstName: 'C', lastName: 'D', phone: '1', address: 'x', city: 'y' },
    ] })
    const otherDevice = await createSession(user.id)
    await db.passwordResetToken.create({ data: { tokenHash: `reset-${serial}`, userId: user.id, expiresAt: new Date(Date.now() + 60_000) } })
    const orderId = String(serial)
    await db.order.create({ data: { id: orderId, createdAt: new Date(), userId: user.id, email: 'typed@example.test', firstName: 'F', lastName: 'L', phone: '1', address: 'a', city: 'c', items: [{ id: 'p1', price: 10, quantity: 1 }], subtotal: 10, tax: 0, delivery: 0, discount: 0, total: 10, deliveryMethod: 'pickup', paymentMethod: 'bank', paymentStatus: 'paid', paymentProvider: 'manual' } })
    await db.bonusTransaction.create({ data: { userId: user.id, type: 'order_earn', points: 5, balanceAfter: 777, orderId } })
    const orderBefore = JSON.stringify(await db.order.findUniqueOrThrow({ where: { id: orderId } }))
    const before = await db.user.findUniqueOrThrow({ where: { id: user.id } })
    jar.session = device

    const res = await confirm(token)

    expect(await bodyOf(res)).toEqual({ status: 200, body: { ok: true } })
    expect(res.headers.get('set-cookie')).toBeNull()
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(after.email).toBe(target)
    expect({ ...after, email: before.email, updatedAt: before.updatedAt }).toEqual(before)
    expect((await db.companyMember.findFirstOrThrow({ where: { userId: user.id } })).email).toBe(target)
    expect((await db.savedAddress.findUniqueOrThrow({ where: { id: ownAddress } })).email).toBe(target)
    expect((await db.savedAddress.findFirstOrThrow({ where: { userId: stranger.id } })).email).toBe(stranger.email)
    expect(await db.passwordResetToken.count({ where: { userId: user.id } })).toBe(0)

    // Orders and bonuses stay exactly as they were, and the owner still sees them.
    expect(JSON.stringify(await db.order.findUniqueOrThrow({ where: { id: orderId } }))).toBe(orderBefore)
    expect(after.bonusPoints).toBe(777)
    expect(await db.bonusTransaction.count({ where: { userId: user.id } })).toBe(1)
    const orders = await (await myOrders(http('/api/orders/my', 'GET'))).json() as { orders: Array<{ id: string }> }
    expect(orders.orders.map((o) => o.id)).toEqual([orderId])

    // This device stays signed in, the other one is out.
    expect((await myOrders(http('/api/orders/my', 'GET'))).status).toBe(200)
    jar.session = otherDevice
    expect((await myOrders(http('/api/orders/my', 'GET'))).status).toBe(401)
    jar.session = device
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1)

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'user.email_changed', entityId: user.id } })
    expect(audit).toMatchObject({ actorUserId: user.id, before: { email: user.email }, after: { email: target } })

    await vi.waitFor(() => expect(mail.some((m) => m.to === user.email)).toBe(true), { timeout: 5000 })
    const notice = mail.find((m) => m.to === user.email)!
    expect(notice.html).not.toContain(target)
    expect(notice.html).toContain('***@example.test')
  }, 30_000)

  it('from another browser needs no session, creates none and ends all of them', async () => {
    const { user, target, token } = await pendingFor()
    jar.session = undefined

    const res = await confirm(token)

    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await emailOf(user.id)).toBe(target)
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0)
  })

  it('works once: a replayed link is refused and leaves the address alone', async () => {
    const { user, target, token } = await pendingFor()
    expect((await confirm(token)).status).toBe(200)
    expect(await bodyOf(await confirm(token))).toEqual(INVALID)
    expect(await emailOf(user.id)).toBe(target)
    expect(await db.auditLog.count({ where: { action: 'user.email_changed', entityId: user.id } })).toBe(1)
  })

  it('refuses tampered, unknown and malformed tokens the same way, and keeps the real one valid', async () => {
    const { user, target, token } = await pendingFor()
    const [id, secret] = token.split('.')
    const flipped = `${id}.${secret.slice(0, -1)}${secret.endsWith('0') ? '1' : '0'}`
    const strangerId = Buffer.from('nobody').toString('base64url')
    for (const bad of [flipped, `${strangerId}.${secret}`, 'x', '', `${id}.short`, `${token}.extra`, 'a'.repeat(600)]) {
      expect(await bodyOf(await confirm(bad))).toEqual(INVALID)
    }
    expect(await emailOf(user.id)).toBe(user.email)
    expect((await confirm(token)).status).toBe(200)
    expect(await emailOf(user.id)).toBe(target)
  })

  it('refuses an expired link', async () => {
    const { user, token } = await pendingFor()
    const key = `email-change:${user.id}`
    const row = await db.keyValueSetting.findUniqueOrThrow({ where: { key } })
    await db.keyValueSetting.update({ where: { key }, data: { value: { ...(row.value as object), expiresAt: new Date(Date.now() - 1000).toISOString() } } })

    expect(await bodyOf(await confirm(token))).toEqual(INVALID)
    expect(await emailOf(user.id)).toBe(user.email)
  })

  it('a newer request voids the previous link', async () => {
    const { user, token } = await pendingFor()
    const second = `second-${serial}@example.test`
    expect((await ask(second)).status).toBe(202)
    const newer = await linkFor(second)

    expect(await bodyOf(await confirm(token))).toEqual(INVALID)
    expect(await emailOf(user.id)).toBe(user.email)
    expect((await confirm(newer)).status).toBe(200)
    expect(await emailOf(user.id)).toBe(second)
  })

  it('refuses when the account e-mail changed since the request', async () => {
    const { user, token } = await pendingFor()
    const corrected = `staff-corrected-${serial}@example.test`
    await db.user.update({ where: { id: user.id }, data: { email: corrected } })

    expect(await bodyOf(await confirm(token))).toEqual(INVALID)
    expect(await emailOf(user.id)).toBe(corrected)
  })

  it('refuses an address taken since the request, even in another letter case, and reveals nothing', async () => {
    const { user, target, token } = await pendingFor()
    await account({ email: target.toUpperCase() })

    expect(await bodyOf(await confirm(token))).toEqual(INVALID)
    expect(await emailOf(user.id)).toBe(user.email)
    expect(await db.auditLog.count({ where: { action: 'user.email_changed', entityId: user.id } })).toBe(0)
  })

  it('races on one link: exactly one wins', async () => {
    const { user, target, token } = await pendingFor()
    const results = await Promise.all(Array.from({ length: 5 }, () => confirm(token)))
    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    expect(results.filter((r) => r.status === 400)).toHaveLength(4)
    expect(await emailOf(user.id)).toBe(target)
    expect(await db.auditLog.count({ where: { action: 'user.email_changed', entityId: user.id } })).toBe(1)
  }, 30_000)

  it('races on one address from two accounts: exactly one gets it', async () => {
    const target = `contested-${serial}@example.test`
    const first = await account()
    await signIn(first.id)
    expect((await ask(target)).status).toBe(202)
    const firstToken = await linkFor(target)
    mail.length = 0
    const second = await account()
    await signIn(second.id)
    expect((await ask(target)).status).toBe(202)
    const secondToken = await linkFor(target)
    jar.session = undefined

    const results = await Promise.all([confirm(firstToken), confirm(secondToken)])

    expect(results.map((r) => r.status).sort()).toEqual([200, 400])
    const owners = await db.user.count({ where: { email: target } })
    expect(owners).toBe(1)
    expect(await db.user.count({ where: { id: { in: [first.id, second.id] }, email: target } })).toBe(1)
  }, 30_000)

  it('gives a card customer with a technical address a first real one, with no notice to the fake mailbox', async () => {
    const user = await account({ email: `card.${serial}@client.local` })
    await signIn(user.id)
    const target = `first-real-${serial}@example.test`
    expect((await ask(target)).status).toBe(202)
    const token = await linkFor(target)
    mail.length = 0
    jar.session = undefined

    expect((await confirm(token)).status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await emailOf(user.id)).toBe(target)
    expect(mail).toHaveLength(0)
  })

  it('keeps MFA and roles for staff: the new address still needs the second factor', async () => {
    const admin = await account({ platformRole: 'admin', mfaEnabled: true, superAdmin: true })
    await signIn(admin.id, true)
    const target = `staff-new-${serial}@example.test`
    expect((await ask(target)).status).toBe(202)
    const token = await linkFor(target)
    await db.mfaChallenge.create({ data: { userId: admin.id, tokenHash: `challenge-${serial}`, expiresAt: new Date(Date.now() + 60_000) } })

    expect((await confirm(token)).status).toBe(200)

    const after = await db.user.findUniqueOrThrow({ where: { id: admin.id } })
    expect(after).toMatchObject({ email: target, platformRole: 'admin', superAdmin: true, mfaEnabled: true, mfaSecret: 'encrypted-secret' })
    expect(await db.mfaChallenge.count({ where: { userId: admin.id } })).toBe(0)
    // The session that confirmed keeps its verified status; it is not downgraded or upgraded.
    expect(await db.session.count({ where: { userId: admin.id, mfaVerified: true } })).toBe(1)

    jar.session = undefined
    serial += 1
    expect((await login(http('/api/auth/login', 'POST', { identifier: admin.email, password: PASSWORD }))).status).toBe(401)
    serial += 1
    const signIned = await login(http('/api/auth/login', 'POST', { identifier: target, password: PASSWORD }))
    expect(signIned.status).toBe(200)
    expect(await signIned.json()).toMatchObject({ mfaRequired: true })
    expect(signIned.cookies.get('eshop_session')).toBeUndefined()
  })

  it('leaves an active customer able to sign in by card with the same password', async () => {
    const { user, token } = await pendingFor()
    jar.session = undefined
    expect((await confirm(token)).status).toBe(200)

    serial += 1
    const res = await login(http('/api/auth/login', 'POST', { identifier: user.cardNumber, password: PASSWORD }))

    expect(res.status).toBe(200)
    expect(res.cookies.get('eshop_session')?.value).toBeTruthy()
  })

  it('account erasure removes a pending change and voids its link', async () => {
    const { user, token } = await pendingFor()
    await anonymizeUser({ id: user.id, email: user.email })

    expect(await db.keyValueSetting.count({ where: { key: `email-change:${user.id}` } })).toBe(0)
    expect(await bodyOf(await confirm(token))).toEqual(INVALID)
  }, 30_000)
})

describe('forgot-password', () => {
  const askReset = (email: string) => {
    serial += 1
    return forgot(http('/api/auth/forgot-password', 'POST', { email, language: 'en' }))
  }

  it('finds an account whose stored address has capitals, and the reset works', async () => {
    const user = await account({ email: `Mixed.Case-${serial}@Example.TEST` })
    const typed = user.email.toLowerCase()

    expect((await askReset(` ${user.email.toUpperCase()} `)).status).toBe(200)

    expect(mail.map((m) => m.to)).toEqual([typed])
    const token = /token=([a-f0-9]+)/.exec(mail[0].html)![1]
    serial += 1
    expect((await reset(http('/api/auth/reset-password', 'POST', { token, password: 'a-brand-new-password-1' }))).status).toBe(200)
    expect(await bcrypt.compare('a-brand-new-password-1', (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash)).toBe(true)
  })

  it('prefers the exact match when addresses differ only by case', async () => {
    const lower = await account({ email: `twin-${serial}@example.test` })
    await account({ email: lower.email.toUpperCase() })

    await askReset(lower.email)

    expect(await db.passwordResetToken.count({ where: { userId: lower.id } })).toBe(1)
  })

  it('issues nothing for an ambiguous address and answers as for any other', async () => {
    const a = await account({ email: `Ambi-${serial}@example.test` })
    const b = await account({ email: a.email.toUpperCase() })

    const ambiguous = await bodyOf(await askReset(a.email.toLowerCase()))
    const unknown = await bodyOf(await askReset(`nobody-${serial}@example.test`))

    expect(ambiguous).toEqual(unknown)
    expect(mail).toHaveLength(0)
    expect(await db.passwordResetToken.count({ where: { userId: { in: [a.id, b.id] } } })).toBe(0)
  })
})
