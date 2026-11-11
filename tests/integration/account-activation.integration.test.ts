import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { NextRequest } from 'next/server'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

// Real route handlers and real SQL on an in-memory PostgreSQL bound to loopback. The URL below
// is the only database this file can reach; mail is captured and never leaves the process.
const { mail, jar } = vi.hoisted(() => ({
  mail: [] as Array<{ to: string; subject: string; html: string }>,
  jar: { session: undefined as string | undefined },
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({
  unstable_cache: <T,>(fn: T) => fn,
  revalidateTag: () => undefined,
  revalidatePath: () => undefined,
}))
vi.mock('@/lib/mailer', () => ({
  sendEmail: async (to: string, subject: string, html: string) => { mail.push({ to, subject, html }) },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'eshop_session' && jar.session ? { value: jar.session } : undefined),
  }),
}))

const OLD_SHARED_PASSWORD = 'legacy-shared-test-password'
const NEW_PASSWORD = 'a-brand-new-password-1'
const ORIGIN = 'http://localhost'

type Routes = {
  login: typeof import('@/app/api/auth/login/route').POST
  registerCard: typeof import('@/app/api/auth/register-card/route').POST
  invite: typeof import('@/app/api/auth/invite/route').POST
  inviteCheck: typeof import('@/app/api/auth/invite/route').GET
  password: typeof import('@/app/api/user/password/route').POST
  forgot: typeof import('@/app/api/auth/forgot-password/route').POST
  reset: typeof import('@/app/api/auth/reset-password/route').POST
}

let pg: PGlite
let socket: PGLiteSocketServer
let db: typeof import('@/lib/prisma').prisma
let routes: Routes
let sharedHash: string
let serial = 100_000

const freePort = (): Promise<number> => new Promise((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address() as { port: number }
    probe.close(() => resolve(port))
  })
})

const post = (url: string, body: unknown, ip = '203.0.113.10'): NextRequest => new NextRequest(`${ORIGIN}${url}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, origin: ORIGIN },
  body: JSON.stringify(body),
})

const login = (identifier: string, password: string, ip?: string) => routes.login(post('/api/auth/login', { identifier, password }, ip))

/** A historical customer as group A holds them: shared hash, card, real e-mail, not activated. */
async function legacyCustomer(overrides: { mustChangePassword?: boolean; email?: string } = {}) {
  serial += 1
  const card = String(serial)
  const user = await db.user.create({
    data: {
      id: crypto.randomUUID().toUpperCase(),
      email: overrides.email ?? `legacy-${serial}@example.test`,
      passwordHash: sharedHash,
      name: `Legacy ${serial}`,
      phone: '+37120000000',
      cardNumber: card,
      platformRole: 'customer',
      mustChangePassword: overrides.mustChangePassword ?? true,
      bonusPoints: 777,
    },
  })
  return { user, card }
}

async function withHistory(userId: string, email: string): Promise<string> {
  const id = String(serial + 5000)
  await db.order.create({
    data: {
      id, createdAt: new Date(), userId, email, items: [], subtotal: 10, tax: 0, delivery: 0, discount: 0, total: 10,
      firstName: 'Legacy', lastName: 'Client', phone: '+37120000000', address: 'Street 1', city: 'Riga',
      deliveryMethod: 'pickup', paymentMethod: 'bank', paymentStatus: 'paid', paymentProvider: 'manual',
    },
  })
  return id
}

const sessionsOf = (userId: string) => db.session.count({ where: { userId } })
const tokenFrom = (html: string): string => {
  const match = /token=([0-9a-zA-Z_-]+)/.exec(html)
  if (!match) throw new Error('no token in mail')
  return match[1]
}

async function requestActivation(card: string, ip = '198.51.100.7'): Promise<Response> {
  return routes.registerCard(post('/api/auth/register-card', { cardNumber: card, language: 'lv', privacyAcknowledged: true }, ip))
}

beforeAll(async () => {
  const port = await freePort()
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
  process.env.DATABASE_URL = url
  // --output, not stdout: prisma.config.ts tooling prints banners there.
  const schemaDir = mkdtempSync(path.join(tmpdir(), 'account-activation-'))
  const schemaFile = path.join(schemaDir, 'schema.sql')
  execFileSync(process.execPath, [
    path.join('node_modules', 'prisma', 'build', 'index.js'),
    'migrate', 'diff', '--from-empty', '--to-schema', path.join('prisma', 'schema.prisma'), '--script', '--output', schemaFile,
  ], { stdio: 'ignore', env: { ...process.env, DATABASE_URL: url } })
  const schemaSql = readFileSync(schemaFile, 'utf8')
  rmSync(schemaDir, { recursive: true, force: true })

  pg = new PGlite()
  await pg.exec(schemaSql)
  socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port, maxConnections: 20 })
  await socket.start()

  db = (await import('@/lib/prisma')).prisma
  const invite = await import('@/app/api/auth/invite/route')
  const reset = await import('@/app/api/auth/reset-password/route')
  routes = {
    login: (await import('@/app/api/auth/login/route')).POST,
    registerCard: (await import('@/app/api/auth/register-card/route')).POST,
    invite: invite.POST,
    inviteCheck: invite.GET,
    password: (await import('@/app/api/user/password/route')).POST,
    forgot: (await import('@/app/api/auth/forgot-password/route')).POST,
    reset: reset.POST,
  }
  // Low cost keeps the suite fast; bcrypt.compare treats it like any other stored hash.
  sharedHash = await bcrypt.hash(OLD_SHARED_PASSWORD, 4)
}, 120_000)

afterAll(async () => {
  await db?.$disconnect()
  await socket?.stop()
  await pg?.close()
})

beforeEach(async () => {
  mail.length = 0
  jar.session = undefined
  await db.rateLimit.deleteMany({})
})

describe('removed login path', () => {
  it('/api/auth/sync no longer exists in the application', () => {
    expect(existsSync(path.join('app', 'api', 'auth', 'sync', 'route.ts'))).toBe(false)
  })
})

describe('login -> mustChangePassword -> session', () => {
  it('gives a not-activated customer no session with the correct old password', async () => {
    const { user, card } = await legacyCustomer()

    const res = await login(card, OLD_SHARED_PASSWORD)

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'activation_required' })
    expect(res.cookies.get('eshop_session')).toBeUndefined()
    expect(await sessionsOf(user.id)).toBe(0)
  })

  it('answers a wrong password with the ordinary 401 and no session', async () => {
    const { user, card } = await legacyCustomer()

    const res = await login(card, 'wrong-password')

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'invalid_credentials' })
    expect(await sessionsOf(user.id)).toBe(0)
  })

  it('keeps normal login for an active customer', async () => {
    const { user, card } = await legacyCustomer({ mustChangePassword: false })

    const res = await login(card, OLD_SHARED_PASSWORD)

    expect(res.status).toBe(200)
    expect(res.cookies.get('eshop_session')?.value).toBeTruthy()
    expect(await sessionsOf(user.id)).toBe(1)
  })

  it('keeps staff on the MFA path even with a forced change pending', async () => {
    serial += 1
    const admin = await db.user.create({
      data: {
        id: `staff-${serial}`, email: `staff-${serial}@example.test`, passwordHash: sharedHash,
        platformRole: 'admin', mustChangePassword: true,
      },
    })

    const res = await login(admin.email, OLD_SHARED_PASSWORD)
    const body = await res.json() as { mfaRequired?: boolean; challengeToken?: string }

    expect(res.status).toBe(200)
    expect(body.mfaRequired).toBe(true)
    expect(body.challengeToken).toBeTruthy()
    expect(await sessionsOf(admin.id)).toBe(0)
  })
})

describe('/api/user/password for a not-activated customer', () => {
  async function sessionFor(userId: string, mfaVerified = false): Promise<void> {
    const { createSession } = await import('@/lib/server-auth')
    jar.session = await createSession(userId, { mfaVerified })
  }

  it('refuses without a session', async () => {
    const res = await routes.password(post('/api/user/password', { newPassword: NEW_PASSWORD }))
    expect(res.status).toBe(401)
  })

  it('refuses a leftover session and keeps the hash, with or without the old password', async () => {
    const { user } = await legacyCustomer()
    await sessionFor(user.id)

    for (const body of [{ newPassword: NEW_PASSWORD }, { currentPassword: OLD_SHARED_PASSWORD, newPassword: NEW_PASSWORD }]) {
      const res = await routes.password(post('/api/user/password', body))
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'activation_required' })
    }
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(after.passwordHash).toBe(sharedHash)
    expect(after.mustChangePassword).toBe(true)
  })

  it('still requires and accepts the current password of an active customer', async () => {
    const { user } = await legacyCustomer({ mustChangePassword: false })
    await sessionFor(user.id)

    const wrong = await routes.password(post('/api/user/password', { currentPassword: 'nope', newPassword: NEW_PASSWORD }))
    expect(wrong.status).toBe(401)
    const right = await routes.password(post('/api/user/password', { currentPassword: OLD_SHARED_PASSWORD, newPassword: NEW_PASSWORD }))
    expect(right.status).toBe(200)
  })

  it('lets MFA-verified staff complete a forced change', async () => {
    serial += 1
    const admin = await db.user.create({
      data: {
        id: `staff-${serial}`, email: `staff-${serial}@example.test`, passwordHash: sharedHash,
        platformRole: 'admin', mustChangePassword: true,
      },
    })
    await sessionFor(admin.id, true)

    const res = await routes.password(post('/api/user/password', { newPassword: NEW_PASSWORD }))

    expect(res.status).toBe(200)
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).mustChangePassword).toBe(false)
  })
})

describe('card number -> e-mail -> one-time link -> new password -> active account', () => {
  it('activates a historical customer without the old password and keeps their data', async () => {
    const { user, card } = await legacyCustomer()
    const orderId = await withHistory(user.id, user.email)

    // No session until the link is used.
    expect((await login(card, OLD_SHARED_PASSWORD)).status).toBe(403)

    const requested = await requestActivation(card)
    expect(requested.status).toBe(202)
    await vi.waitFor(() => expect(mail).toHaveLength(1), { timeout: 10_000 })
    expect(mail[0].to).toBe(user.email)
    expect(await sessionsOf(user.id)).toBe(0)

    const token = tokenFrom(mail[0].html)
    const check = await routes.inviteCheck(new NextRequest(`${ORIGIN}/api/auth/invite?token=${token}`))
    expect(check.status).toBe(200)

    const activated = await routes.invite(post('/api/auth/invite', { token, password: NEW_PASSWORD, privacyAcknowledged: true }))
    expect(activated.status).toBe(200)
    expect(activated.cookies.get('eshop_session')?.value).toBeTruthy()

    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(after.mustChangePassword).toBe(false)
    expect(after.cardNumber).toBe(card)
    expect(after.email).toBe(user.email)
    expect(after.name).toBe(user.name)
    expect(after.phone).toBe(user.phone)
    expect(after.passwordHash).not.toBe(sharedHash)
    // Existing points survive; the only credit is the existing one-time welcome bonus, if configured.
    const welcome = await db.bonusTransaction.aggregate({ where: { userId: user.id, type: 'welcome' }, _sum: { points: true } })
    expect(after.bonusPoints).toBe(777 + (welcome._sum.points ?? 0))
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } })
    expect(order.userId).toBe(user.id)
    expect(order.email).toBe(user.email)

    // The old password is dead and the new one is a normal login.
    expect((await login(card, OLD_SHARED_PASSWORD)).status).toBe(401)
    const fresh = await login(card, NEW_PASSWORD)
    expect(fresh.status).toBe(200)
    expect(fresh.cookies.get('eshop_session')?.value).toBeTruthy()
  }, 30_000)

  it('activates a historical customer whose stored e-mail has capital letters', async () => {
    serial += 1
    const email = `Legacy.Mixed-${serial}@Example.TEST`
    const { user, card } = await legacyCustomer({ email })

    await requestActivation(card)
    await vi.waitFor(() => expect(mail).toHaveLength(1), { timeout: 10_000 })
    expect(mail[0].to).toBe(email.toLowerCase())

    const res = await routes.invite(post('/api/auth/invite', { token: tokenFrom(mail[0].html), password: NEW_PASSWORD, privacyAcknowledged: true }))

    expect(res.status).toBe(200)
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(email)
    expect((await login(card, NEW_PASSWORD)).status).toBe(200)
  }, 30_000)

  it('does not accept the link twice', async () => {
    const { user, card } = await legacyCustomer()
    await requestActivation(card)
    await vi.waitFor(() => expect(mail).toHaveLength(1), { timeout: 10_000 })
    const token = tokenFrom(mail[0].html)

    const first = await routes.invite(post('/api/auth/invite', { token, password: NEW_PASSWORD, privacyAcknowledged: true }))
    expect(first.status).toBe(200)
    const hashAfterFirst = (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash
    const sessionsAfterFirst = await sessionsOf(user.id)

    const replay = await routes.invite(post('/api/auth/invite', { token, password: 'attacker-password-1', privacyAcknowledged: true }))

    expect(replay.status).toBe(409)
    expect(replay.cookies.get('eshop_session')).toBeUndefined()
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(hashAfterFirst)
    expect(await sessionsOf(user.id)).toBe(sessionsAfterFirst)
  }, 30_000)

  it('rejects an unknown link and leaves the account dormant', async () => {
    const { user } = await legacyCustomer()

    const res = await routes.invite(post('/api/auth/invite', { token: 'f'.repeat(64), password: NEW_PASSWORD, privacyAcknowledged: true }))

    expect(res.status).toBe(404)
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).mustChangePassword).toBe(true)
    expect(await sessionsOf(user.id)).toBe(0)
  })

  it('never mails a card that is already active, and answers the same way', async () => {
    const { card } = await legacyCustomer({ mustChangePassword: false })

    const res = await requestActivation(card)

    expect(res.status).toBe(202)
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(mail).toHaveLength(0)
  })

  it('accepts an administrator invitation through the same one-time link', async () => {
    const { user, card } = await legacyCustomer()
    const { newInviteToken, replaceInvitation } = await import('@/lib/invitations')
    const token = newInviteToken()
    await replaceInvitation(db, {
      userId: user.id, email: user.email, cardNumber: card, token,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(), language: 'ru',
    })

    const res = await routes.invite(post('/api/auth/invite', { token, password: NEW_PASSWORD, privacyAcknowledged: true }))

    expect(res.status).toBe(200)
    expect((await login(card, NEW_PASSWORD)).status).toBe(200)
  }, 30_000)

  it('keeps password recovery working as a route to activation', async () => {
    const { user, card } = await legacyCustomer()

    const forgot = await routes.forgot(post('/api/auth/forgot-password', { email: user.email, language: 'lv' }))
    expect(forgot.status).toBe(200)
    expect(mail).toHaveLength(1)
    expect(mail[0].to).toBe(user.email)

    const reset = await routes.reset(post('/api/auth/reset-password', { token: tokenFrom(mail[0].html), password: NEW_PASSWORD }))
    expect(reset.status).toBe(200)
    expect(await sessionsOf(user.id)).toBe(0)
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).mustChangePassword).toBe(false)
    expect((await login(card, NEW_PASSWORD)).status).toBe(200)
  }, 30_000)
})

describe('login rate limit with real counters', () => {
  const ip = '192.0.2.50'

  it('lets many clients behind one address sign in: successes do not consume the IP budget', async () => {
    const { card } = await legacyCustomer({ mustChangePassword: false })

    for (let i = 0; i < 40; i += 1) {
      expect((await login(card, OLD_SHARED_PASSWORD, ip)).status).toBe(200)
    }
    const row = await db.rateLimit.findUnique({ where: { key: `login:ip:${ip}` } })
    expect(row?.count).toBe(0)
  }, 60_000)

  it('does not let an attacker erase failures with their own valid account', async () => {
    const attacker = await legacyCustomer({ mustChangePassword: false })
    const victims = await Promise.all(Array.from({ length: 4 }, () => legacyCustomer()))
    let failures = 0
    let attackerLogins = 0
    let blocked = false

    // 8 guesses per victim stays under the per-card limit of 10, so only the IP budget can stop this.
    // Before the fix each successful login below would have cleared the failures and this never ended.
    guessing: for (const victim of victims) {
      for (let guess = 0; guess < 8; guess += 1) {
        const res = await login(victim.card, `guess-${guess}`, ip)
        if (res.status === 429) { blocked = true; break guessing }
        expect(res.status).toBe(401)
        failures += 1
        if (guess % 2 === 1) {
          const own = await login(attacker.card, OLD_SHARED_PASSWORD, ip)
          if (own.status === 429) { blocked = true; break guessing }
          expect(own.status).toBe(200)
          attackerLogins += 1
        }
      }
    }

    expect(blocked).toBe(true)
    expect(failures).toBe(30)
    expect(attackerLogins).toBeGreaterThan(10)
  }, 60_000)

  it('still locks one card after 10 attempts regardless of IP, and a success restarts that counter', async () => {
    const { card } = await legacyCustomer({ mustChangePassword: false })

    for (let i = 0; i < 5; i += 1) expect((await login(card, 'wrong', `192.0.2.${i + 100}`)).status).toBe(401)
    expect((await login(card, OLD_SHARED_PASSWORD, '192.0.2.200')).status).toBe(200)
    expect(await db.rateLimit.findUnique({ where: { key: `login:card:${card}` } })).toBeNull()

    for (let i = 0; i < 10; i += 1) expect((await login(card, 'wrong', `192.0.2.${i + 100}`)).status).toBe(401)
    expect((await login(card, OLD_SHARED_PASSWORD, '192.0.2.201')).status).toBe(429)
  }, 60_000)
})
