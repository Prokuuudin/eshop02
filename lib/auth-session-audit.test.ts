import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'

// Stateful harness: sessions and audit rows are staged per transaction and
// published only on success; transactions run one at a time. The real
// createSession / deleteSession / hashToken / requiresAdminMfa are used.

type User = { id: string; email: string; name: string | null; platformRole: string; teamRole: string | null }
type Session = { id: string; userId: string; tokenHash: string; expiresAt: Date; mfaVerified: boolean }
type Audit = { actorId: string; action: string; entityType: string; entityId: string; after?: unknown; request: NextRequest }
type State = { users: Record<string, User>; sessions: Session[]; audits: Audit[] }

const h = vi.hoisted(() => ({
  state: null as unknown as State,
  queue: Promise.resolve() as Promise<unknown>,
  appendServerAudit: vi.fn(),
  logApiError: vi.fn(),
  afterTasks: [] as Array<Promise<unknown>>,
}))

function db(s: State) {
  return {
    _state: s,
    user: { findUnique: async ({ where }: { where: { id: string } }) => s.users[where.id] ?? null },
    session: {
      create: async ({ data }: { data: Session }) => { s.sessions.push({ ...data }) },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const row = s.sessions.find((x) => x.tokenHash === where.tokenHash)
        return row ? { ...row, user: s.users[row.userId] } : null
      },
      deleteMany: async ({ where }: { where: { tokenHash: string } }) => {
        const before = s.sessions.length
        s.sessions = s.sessions.filter((x) => x.tokenHash !== where.tokenHash)
        return { count: before - s.sessions.length }
      },
    },
  }
}

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@/lib/observability', () => ({ logApiError: h.logApiError }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: h.appendServerAudit }))
vi.mock('next/server', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/server')>(),
  after: (task: () => Promise<unknown>) => { h.afterTasks.push(task()) },
}))
vi.mock('@/lib/prisma', () => {
  const live = new Proxy({}, {
    get(_target, key: string) {
      if (key === '$transaction') {
        return async (run: (tx: ReturnType<typeof db>) => Promise<unknown>) => {
          const previous = h.queue
          let release = (): void => undefined
          h.queue = new Promise<void>((resolve) => { release = resolve })
          await previous
          try {
            const staged = { ...h.state, users: h.state.users, sessions: h.state.sessions.map((x) => ({ ...x })), audits: [...h.state.audits] }
            const result = await run(db(staged))
            h.state = staged
            return result
          } finally {
            release()
          }
        }
      }
      return db(h.state)[key as keyof ReturnType<typeof db>]
    },
  })
  return { prisma: live }
})

import { createStaffSessionWithAudit, recordRejectedStaffLogin, revokeSessionWithAudit } from './auth-session-audit'

const ADMIN: User = { id: 'admin-1', email: 'admin@test.com', name: 'Admin', platformRole: 'admin', teamRole: null }
const MANAGER: User = { id: 'manager-1', email: 'manager@test.com', name: 'M', platformRole: 'customer', teamRole: 'manager' }
const CUSTOMER: User = { id: 'client-1', email: 'client@test.com', name: 'C', platformRole: 'customer', teamRole: 'admin' }
const sha = (value: string) => createHash('sha256').update(value).digest('hex')

function request(cookie = 'live-cookie-token'): NextRequest {
  return new NextRequest('https://shop.test/api/auth/x', {
    method: 'POST',
    headers: { cookie: `eshop_session=${cookie}`, 'user-agent': 'Vitest', 'x-forwarded-for': '203.0.113.7' },
  })
}
function session(user: User, token: string, expiresInMs = 3_600_000): Session {
  return { id: `s-${token}`, userId: user.id, tokenHash: sha(token), expiresAt: new Date(Date.now() + expiresInMs), mfaVerified: true }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.queue = Promise.resolve()
  h.afterTasks = []
  h.state = { users: { [ADMIN.id]: ADMIN, [MANAGER.id]: MANAGER, [CUSTOMER.id]: CUSTOMER }, sessions: [], audits: [] }
  h.appendServerAudit.mockImplementation(async (tx: { _state: State }, req: NextRequest, actor: { id: string }, input: Omit<Audit, 'actorId' | 'request'>) => {
    tx._state.audits.push({ actorId: actor.id, ...input, request: req })
  })
})

describe('createStaffSessionWithAudit', () => {
  it('creates the MFA-verified session and the sign-in event together', async () => {
    const token = await createStaffSessionWithAudit(request(), ADMIN as never, 'totp')

    expect(h.state.sessions).toEqual([expect.objectContaining({ userId: 'admin-1', tokenHash: sha(token), mfaVerified: true })])
    expect(h.state.audits).toEqual([expect.objectContaining({
      actorId: 'admin-1', action: 'auth.admin_login_succeeded', entityType: 'user', entityId: 'admin-1',
      after: { method: 'totp', mfaVerified: true },
    })])
  })

  it('writes the event without the session cookie so no session hash is stored, keeping client headers', async () => {
    await createStaffSessionWithAudit(request('old-cookie'), ADMIN as never, 'enrollment')
    const req = h.state.audits[0].request
    expect(req.cookies.get('eshop_session')).toBeUndefined()
    expect(req.headers.get('cookie')).toBeNull()
    expect(req.headers.get('user-agent')).toBe('Vitest')
    expect(req.headers.get('x-forwarded-for')).toBe('203.0.113.7')
  })

  it('issues no session when the audit fails (fail closed)', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(createStaffSessionWithAudit(request(), ADMIN as never, 'totp')).rejects.toThrow('audit unavailable')
    expect(h.state.sessions).toHaveLength(0)
    expect(h.state.audits).toHaveLength(0)
  })

  it('never puts the token or its hash into the event', async () => {
    const token = await createStaffSessionWithAudit(request(), ADMIN as never, 'backup_code')
    const { request: _req, ...event } = h.state.audits[0]
    const serialized = JSON.stringify(event)
    expect(serialized).not.toContain(token)
    expect(serialized).not.toContain(sha(token))
  })
})

describe('recordRejectedStaffLogin', () => {
  it('records a rejected staff sign-in after the response', async () => {
    recordRejectedStaffLogin(request(), MANAGER as never, 'invalid_mfa_code')
    await Promise.all(h.afterTasks)
    expect(h.state.audits).toEqual([expect.objectContaining({
      actorId: 'manager-1', action: 'auth.admin_login_rejected', entityId: 'manager-1', after: { reason: 'invalid_mfa_code' },
    })])
    expect(h.state.audits[0].request.headers.get('cookie')).toBeNull()
  })

  it('ignores customer accounts', async () => {
    recordRejectedStaffLogin(request(), CUSTOMER as never, 'invalid_password')
    await Promise.all(h.afterTasks)
    expect(h.afterTasks).toHaveLength(0)
    expect(h.state.audits).toHaveLength(0)
  })

  it('only logs an audit failure', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    recordRejectedStaffLogin(request(), ADMIN as never, 'invalid_password')
    await expect(Promise.all(h.afterTasks)).resolves.toBeDefined()
    expect(h.logApiError).toHaveBeenCalledWith('[auth] rejected staff login audit failed', expect.any(Error))
  })
})

describe('revokeSessionWithAudit', () => {
  it('revokes a live staff session and records the sign-out in the same transaction', async () => {
    h.state.sessions = [session(ADMIN, 'tok-a'), session(ADMIN, 'tok-b')]
    await revokeSessionWithAudit(request('tok-a'), 'tok-a')
    expect(h.state.sessions.map((x) => x.id)).toEqual(['s-tok-b'])
    expect(h.state.audits).toEqual([expect.objectContaining({
      actorId: 'admin-1', action: 'auth.admin_logout', entityId: 'admin-1', after: { sessionRevoked: true, mfaVerified: true },
    })])
    const { request: req, ...event } = h.state.audits[0]
    expect(req.headers.get('cookie')).toBeNull()
    expect(JSON.stringify(event)).not.toContain(sha('tok-a'))
  })

  it('revokes customer and expired staff sessions without an admin event', async () => {
    h.state.sessions = [session(CUSTOMER, 'tok-c'), session(ADMIN, 'tok-old', -1000)]
    await revokeSessionWithAudit(request('tok-c'), 'tok-c')
    await revokeSessionWithAudit(request('tok-old'), 'tok-old')
    expect(h.state.sessions).toHaveLength(0)
    expect(h.state.audits).toHaveLength(0)
  })

  it('a repeated logout finds nothing and records nothing', async () => {
    h.state.sessions = [session(ADMIN, 'tok-a')]
    await revokeSessionWithAudit(request('tok-a'), 'tok-a')
    await revokeSessionWithAudit(request('tok-a'), 'tok-a')
    expect(h.state.audits).toHaveLength(1)
  })

  it('two concurrent logouts of one session record one event', async () => {
    h.state.sessions = [session(MANAGER, 'tok-m')]
    await Promise.all([revokeSessionWithAudit(request('tok-m'), 'tok-m'), revokeSessionWithAudit(request('tok-m'), 'tok-m')])
    expect(h.state.sessions).toHaveLength(0)
    expect(h.state.audits).toHaveLength(1)
  })

  it('still revokes the session when the audit fails', async () => {
    h.state.sessions = [session(ADMIN, 'tok-a')]
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(revokeSessionWithAudit(request('tok-a'), 'tok-a')).resolves.toBeUndefined()
    expect(h.state.sessions).toHaveLength(0)
    expect(h.state.audits).toHaveLength(0)
    expect(h.logApiError).toHaveBeenCalledWith('[auth/logout] audited revoke failed; revoking without audit', expect.any(Error))
  })
})
