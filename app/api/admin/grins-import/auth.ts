import { NextResponse } from 'next/server'
import { requireAdminPermission, type ServerUser } from '@/lib/server-auth'

/** Manual GrinS import writes prices and stock: both permissions are required. */
export async function requireGrinsImportActor(): Promise<ServerUser | NextResponse> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor
  const prices = await requireAdminPermission('prices.update')
  if (prices instanceof NextResponse) return prices
  return actor
}
