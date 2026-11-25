import { Prisma } from '@/generated/prisma/client'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { USER_REFERENCE_HANDLING, type UserReference } from '@/lib/admin-account-merge'

/**
 * In-memory database for the account-merge tests: enough of the Prisma surface that
 * lib/admin-account-merge, the revoked-card policy and the marketing suppression list use.
 * Unique constraints that matter for a merge (User.email, KeyValueSetting.key,
 * WishlistItem/ProductNewsSubscription userId+productId) are enforced like Postgres would.
 */

export type FakeUser = {
  id: string
  email: string
  name: string | null
  phone: string | null
  cardNumber: string | null
  platformRole: string
  teamRole: string | null
  superAdmin: boolean
  companyId: string | null
  companyName: string | null
  customerType: string | null
  registrationNumber: string | null
  vatNumber: string | null
  legalAddress: string | null
  bonusPoints: number
  mustChangePassword: boolean
  privacyAcknowledgedAt: Date | null
  mfaEnabled: boolean
  cardRecoveryEmailHash: string | null
  cardRecoveryPhoneHash: string | null
  checkoutProfile: unknown
  passwordHash: string
  mfaSecret: string | null
  mfaBackupCodes: string[]
  pkLast3: string | null
  createdAt: Date
  updatedAt: Date
}

type Row = { id: string; userId: string | null; [key: string]: unknown }

export type FakeState = {
  users: Record<string, FakeUser>
  settings: Record<string, unknown>
  orders: Row[]
  savedAddresses: Row[]
  wishlist: Row[]
  productNews: Row[]
  promoRedemptions: Row[]
  notifications: Row[]
  invitationTokens: Row[]
  passwordResetTokens: Row[]
  /** Counts for the blocking references that have no in-memory table here. */
  blockingRefs: Record<string, Partial<Record<UserReference, number>>>
  clock: number
}

export const LEGACY_ID = 'legacy-1'
export const CARD_ID = 'card-1'

export function legacyUser(fields: Partial<FakeUser> = {}): FakeUser {
  return {
    id: LEGACY_ID, email: 'anna@example.com', name: 'Anna Ozola', phone: null, cardNumber: null,
    platformRole: 'customer', teamRole: null, superAdmin: false, companyId: null, companyName: null,
    customerType: 'individual', registrationNumber: null, vatNumber: null, legalAddress: null,
    bonusPoints: 0, mustChangePassword: true, privacyAcknowledgedAt: null, mfaEnabled: false,
    cardRecoveryEmailHash: null, cardRecoveryPhoneHash: null, checkoutProfile: null,
    passwordHash: '$2b$12$secret-hash', mfaSecret: null, mfaBackupCodes: [], pkLast3: '123',
    createdAt: new Date('2024-05-01T09:00:00.000Z'), updatedAt: new Date('2024-05-01T09:00:00.000Z'),
    ...fields,
  }
}

export function cardUser(fields: Partial<FakeUser> = {}): FakeUser {
  return legacyUser({
    id: CARD_ID, email: 'card.4242@client.local', name: 'Anna Ozola', phone: '20000001', cardNumber: '4242',
    pkLast3: '901', passwordHash: '$2b$10$other-secret',
    createdAt: new Date('2026-08-01T12:00:00.000Z'), updatedAt: new Date('2026-09-01T12:00:00.000Z'),
    ...fields,
  })
}

export function createState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    users: { [LEGACY_ID]: legacyUser(), [CARD_ID]: cardUser() },
    settings: {},
    orders: [{ id: 'order-1', userId: LEGACY_ID, createdAt: new Date('2024-06-01T10:00:00.000Z'), total: new Prisma.Decimal('12.50'), paymentStatus: 'paid' }],
    savedAddresses: [],
    wishlist: [],
    productNews: [],
    promoRedemptions: [],
    notifications: [],
    invitationTokens: [],
    passwordResetTokens: [],
    blockingRefs: {},
    clock: Date.parse('2026-11-25T10:00:00.000Z'),
    ...overrides,
  }
}

const TABLES: Partial<Record<UserReference, keyof FakeState>> = {
  'Order.userId': 'orders',
  'SavedAddress.userId': 'savedAddresses',
  'WishlistItem.userId': 'wishlist',
  'ProductNewsSubscription.userId': 'productNews',
  'PromoCodeRedemption.userId': 'promoRedemptions',
  'UserNotification.userId': 'notifications',
  'InvitationToken.userId': 'invitationTokens',
  'PasswordResetToken.userId': 'passwordResetTokens',
}

type Where = Record<string, unknown>

function matches(row: Record<string, unknown>, where: Where = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key]
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const c = condition as { in?: unknown[]; not?: unknown }
      if (c.in) return c.in.includes(value)
      if ('not' in c) return value !== c.not
    }
    if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime()
    return value === condition
  })
}

function select<T extends Record<string, unknown>>(row: T, fields?: Record<string, boolean>): Partial<T> {
  // Shallow copies: structuredClone would turn a Prisma.Decimal into a plain object.
  if (!fields) return { ...row }
  return Object.fromEntries(Object.keys(fields).map((key) => [key, row[key]])) as Partial<T>
}

function table(state: FakeState, name: keyof FakeState, unique?: string) {
  const rows = () => state[name] as Row[]
  return {
    findMany: async ({ where, select: fields }: { where?: Where; select?: Record<string, boolean> } = {}) =>
      rows().filter((row) => matches(row, where)).map((row) => select(row, fields)),
    updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      const hits = rows().filter((row) => matches(row, where))
      if (unique) {
        for (const row of hits) {
          const next = { ...row, ...data }
          if (rows().some((other) => other !== row && other.userId === next.userId && other[unique] === next[unique])) {
            throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
          }
        }
      }
      hits.forEach((row) => Object.assign(row, data))
      return { count: hits.length }
    },
    deleteMany: async ({ where }: { where: Where }) => {
      const before = rows().length
      ;(state[name] as Row[]) = rows().filter((row) => !matches(row, where))
      return { count: before - rows().length }
    },
  }
}

/** A Prisma transaction client over `state`. Writes apply immediately (tests assert on state). */
export function fakeTx(state: FakeState): ExtendedTransactionClient {
  const users = () => Object.values(state.users)
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?')
      if (text.includes('FOR UPDATE')) {
        return values.filter((id) => typeof id === 'string' && state.users[id]).sort().map((id) => ({ id }))
      }
      // countUserReferences: one Prisma.Sql with the user id as every value.
      const userId = (values[0] as Prisma.Sql).values[0] as string
      return [Object.fromEntries((Object.keys(USER_REFERENCE_HANDLING) as UserReference[]).map((ref) => {
        const name = TABLES[ref]
        const count = name ? (state[name] as Row[]).filter((row) => row.userId === userId).length : 0
        return [ref, count + (state.blockingRefs[userId]?.[ref] ?? 0)]
      }))]
    },
    user: {
      findUnique: async ({ where, select: fields }: { where: { id?: string; email?: string }; select?: Record<string, boolean> }) => {
        const user = where.id ? state.users[where.id] : users().find((u) => u.email === where.email)
        return user ? select(user, fields) : null
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const user = state.users[where.id]
        if (!user) throw new Error('not found')
        return structuredClone(user)
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const hits = users().filter((u) => matches(u, where))
        hits.forEach((u) => { delete state.users[u.id] })
        return { count: hits.length }
      },
      updateMany: async ({ where, data }: { where: Where; data: Partial<FakeUser> }) => {
        const hits = users().filter((u) => matches(u, where))
        for (const user of hits) {
          if (data.email && users().some((other) => other.id !== user.id && other.email === data.email)) {
            throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
          }
          Object.assign(user, data, { updatedAt: new Date(state.clock += 1000) })
        }
        return { count: hits.length }
      },
    },
    keyValueSetting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        (where.key in state.settings ? { key: where.key, value: structuredClone(state.settings[where.key]), updatedAt: new Date(state.clock) } : null),
      findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
        where.key.in.filter((key) => key in state.settings).map((key) => ({ key, value: structuredClone(state.settings[key]) })),
      create: async ({ data }: { data: { key: string; value: unknown } }) => {
        if (data.key in state.settings) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
        state.settings[data.key] = structuredClone(data.value)
      },
      upsert: async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => {
        if (!(where.key in state.settings)) state.settings[where.key] = structuredClone(create.value)
      },
    },
    order: table(state, 'orders'),
    savedAddress: table(state, 'savedAddresses'),
    wishlistItem: table(state, 'wishlist', 'productId'),
    productNewsSubscription: table(state, 'productNews', 'productId'),
    promoCodeRedemption: table(state, 'promoRedemptions'),
    userNotification: table(state, 'notifications'),
    invitationToken: table(state, 'invitationTokens'),
    passwordResetToken: table(state, 'passwordResetTokens'),
  }
  return tx as unknown as ExtendedTransactionClient
}
