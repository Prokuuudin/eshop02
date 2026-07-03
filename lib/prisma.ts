import { neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import ws from 'ws'
import { PrismaClient } from '../generated/prisma/client'

// WebSocket через 443 вместо TCP 5432 — не режется VPN/файрволами
neonConfig.webSocketConstructor = ws

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

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
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
