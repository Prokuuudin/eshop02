import { neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import type { ITXClientDenyList } from '@prisma/client/runtime/client'
import ws from 'ws'
import { PrismaClient } from '../generated/prisma/client'
import { moneyFieldsExtension } from './prisma-money-extension'

// WebSocket через 443 вместо TCP 5432 — не режется VPN/файрволами
neonConfig.webSocketConstructor = ws

function getDbUrl(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  if (!url) throw new Error('No DATABASE_URL set')
  return url
}

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: getDbUrl() })
  return new PrismaClient({ adapter }).$extends(moneyFieldsExtension)
}

// `.$extends()` returns a client type that is a structural superset of the
// raw generated `PrismaClient` but is NOT a subtype of it in TypeScript's eyes
// (extension-wrapped model methods use a different generic signature shape).
// Any module that type-annotates a Prisma client/transaction-client parameter
// must derive its type from these exports instead of importing the raw
// `PrismaClient` / `Prisma.TransactionClient` from the generated client.
export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>
// Mirrors how the generated client itself derives `Prisma.TransactionClient`
// (`Omit<PrismaClient, ITXClientDenyList>`), applied to the extended client —
// this is the actual type of `tx` inside `prisma.$transaction(async (tx) => ...)`.
export type ExtendedTransactionClient = Omit<ExtendedPrismaClient, ITXClientDenyList>

const globalForPrisma = globalThis as unknown as { prisma: ExtendedPrismaClient }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
