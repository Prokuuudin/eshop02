import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Stateful harness: each $transaction works on a staged copy published only on
// success; transactions run one at a time, as the row lock serialises them.

type Message = { name: string; email: string; subject: string; message: string; answeredAt: Date | null; answeredById: string | null }
type Audit = { actorId: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown }
type State = { messages: Record<string, Message>; audits: Audit[] }

const h = vi.hoisted(() => ({
  state: null as unknown as State,
  queue: Promise.resolve() as Promise<unknown>,
  appendServerAudit: vi.fn(),
  rawQueries: [] as string[],
}))

function db(s: State) {
  return {
    _state: s,
    $queryRaw: async (strings: TemplateStringsArray, id: string) => {
      h.rawQueries.push(strings.join('?'))
      return s.messages[id] ? [{ id }] : []
    },
    contactMessage: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = s.messages[where.id]
        return row ? { answeredAt: row.answeredAt, answeredById: row.answeredById } : null
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Message> }) => {
        Object.assign(s.messages[where.id], data)
      },
    },
  }
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: h.appendServerAudit }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: async (run: (tx: ReturnType<typeof db>) => Promise<unknown>) => {
      const previous = h.queue
      let release = (): void => undefined
      h.queue = new Promise<void>((resolve) => { release = resolve })
      await previous
      try {
        const staged = structuredClone(h.state)
        const result = await run(db(staged))
        h.state = staged
        return result
      } finally {
        release()
      }
    },
  },
}))

import { setContactMessageAnswered } from './contact-message-status'

const request = new NextRequest('http://localhost/api/admin/contact-messages', { method: 'PATCH' })
const audit = (id: string) => ({ actor: { id, email: `${id}@test.com` }, request }) as never
const T0 = new Date('2026-11-01T08:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-10T09:30:00Z'))
  h.queue = Promise.resolve()
  h.rawQueries = []
  h.state = {
    messages: {
      m1: { name: 'Anna Liepa', email: 'anna@inbox.lv', subject: 'Pasūtījums 42', message: 'Kur ir mana paka?', answeredAt: null, answeredById: null },
      m2: { name: 'Jānis', email: 'janis@inbox.lv', subject: 'Atgriešana', message: 'Gribu atgriezt', answeredAt: T0, answeredById: 'admin-0' },
    },
    audits: [],
  }
  h.appendServerAudit.mockImplementation(async (tx: { _state: State }, _req: NextRequest, actor: { id: string }, input: Omit<Audit, 'actorId'>) => {
    tx._state.audits.push({ actorId: actor.id, ...input })
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('setContactMessageAnswered', () => {
  it('marks a message answered by the session actor and audits the transition under a row lock', async () => {
    await expect(setContactMessageAnswered('m1', true, audit('admin-1'))).resolves.toBe('changed')

    expect(h.state.messages.m1).toMatchObject({ answeredAt: new Date('2026-11-10T09:30:00Z'), answeredById: 'admin-1' })
    expect(h.state.audits).toEqual([{
      actorId: 'admin-1', action: 'contact_message.marked_answered', entityType: 'contact_message', entityId: 'm1',
      before: { answered: false, answeredAt: null, answeredById: null },
      after: { answered: true, answeredAt: '2026-11-10T09:30:00.000Z', answeredById: 'admin-1' },
    }])
    expect(h.rawQueries[0]).toMatch(/FROM "ContactMessage" WHERE id = \? FOR UPDATE/u)
  })

  it('marks a message unanswered and keeps the previous answer in the event', async () => {
    await expect(setContactMessageAnswered('m2', false, audit('admin-1'))).resolves.toBe('changed')

    expect(h.state.messages.m2).toMatchObject({ answeredAt: null, answeredById: null })
    expect(h.state.audits[0]).toMatchObject({
      action: 'contact_message.marked_unanswered',
      before: { answered: true, answeredAt: T0.toISOString(), answeredById: 'admin-0' },
      after: { answered: false, answeredAt: null, answeredById: null },
    })
  })

  it('keeps the original answeredAt and answeredById when "answered" is repeated, without an event', async () => {
    await expect(setContactMessageAnswered('m2', true, audit('admin-2'))).resolves.toBe('unchanged')

    expect(h.state.messages.m2).toMatchObject({ answeredAt: T0, answeredById: 'admin-0' })
    expect(h.state.audits).toHaveLength(0)
  })

  it('treats a repeated "unanswered" as a no-op', async () => {
    await expect(setContactMessageAnswered('m1', false, audit('admin-1'))).resolves.toBe('unchanged')
    expect(h.state.audits).toHaveLength(0)
  })

  it('reports a missing message without writing', async () => {
    await expect(setContactMessageAnswered('missing', true, audit('admin-1'))).resolves.toBe('not_found')
    expect(h.state.audits).toHaveLength(0)
  })

  it('never puts the sender name, email, subject or text into the audit', async () => {
    await setContactMessageAnswered('m1', true, audit('admin-1'))
    await setContactMessageAnswered('m2', false, audit('admin-1'))
    const serialized = JSON.stringify(h.state.audits)
    for (const secret of ['Anna', 'inbox.lv', 'Pasūtījums', 'paka', 'Atgriešana', 'Gribu']) expect(serialized).not.toContain(secret)
  })

  it('rolls the status back when the audit fails', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    const before = structuredClone(h.state)
    await expect(setContactMessageAnswered('m1', true, audit('admin-1'))).rejects.toThrow('audit unavailable')
    expect(h.state).toEqual(before)
  })

  it('two concurrent "answered" requests keep the first answer and record one event', async () => {
    const results = await Promise.all([
      setContactMessageAnswered('m1', true, audit('admin-1')),
      setContactMessageAnswered('m1', true, audit('admin-2')),
    ])
    expect(results.sort()).toEqual(['changed', 'unchanged'])
    expect(h.state.messages.m1.answeredById).toBe('admin-1')
    expect(h.state.audits).toHaveLength(1)
  })

  it('concurrent opposite requests apply in order and audit each real transition', async () => {
    await Promise.all([
      setContactMessageAnswered('m1', true, audit('admin-1')),
      setContactMessageAnswered('m1', false, audit('admin-2')),
    ])
    expect(h.state.audits.map((a) => a.action)).toEqual(['contact_message.marked_answered', 'contact_message.marked_unanswered'])
    expect(h.state.audits[1].before).toMatchObject({ answered: true, answeredById: 'admin-1' })
    expect(h.state.messages.m1.answeredAt).toBeNull()
  })
})
