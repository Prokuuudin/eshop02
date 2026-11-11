import type { NextRequest } from 'next/server'
import type { Product } from '@/data/products'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'
import type { ArchivedProductRecord, ProductOverride } from '@/lib/product-overrides-store'

export type ProductAuditContext = { actor: ServerUser; request: NextRequest }

export async function appendProductArchivedAudit(
  tx: ExtendedTransactionClient,
  audit: ProductAuditContext,
  archived: ArchivedProductRecord,
  requestId?: string,
): Promise<void> {
  await appendServerAudit(tx, audit.request, audit.actor, {
    action: 'product.archived',
    entityType: 'product',
    entityId: archived.id,
    entityTitle: archived.product.title,
    before: { archived: false, source: archived.source },
    after: { archived: true, source: archived.source, deletedAt: archived.deletedAt },
    requestId,
  })
}

export async function appendProductRestoredAudit(
  tx: ExtendedTransactionClient,
  audit: ProductAuditContext,
  archived: ArchivedProductRecord,
): Promise<void> {
  await appendServerAudit(tx, audit.request, audit.actor, {
    action: 'product.restored', entityType: 'product', entityId: archived.id,
    entityTitle: archived.product.title,
    before: { archived: true, source: archived.source, deletedAt: archived.deletedAt },
    after: { archived: false, source: archived.source },
  })
}

export async function appendProductPermanentlyDeletedAudit(
  tx: ExtendedTransactionClient,
  audit: ProductAuditContext,
  archived: ArchivedProductRecord,
): Promise<void> {
  await appendServerAudit(tx, audit.request, audit.actor, {
    action: 'product.permanently_deleted', entityType: 'product', entityId: archived.id,
    entityTitle: archived.product.title,
    before: { archived: true, source: archived.source, deletedAt: archived.deletedAt },
    after: { archived: false, permanentlyDeleted: true, source: archived.source },
  })
}

export async function appendProductOverrideResetAudit(
  tx: ExtendedTransactionClient,
  audit: ProductAuditContext,
  product: Pick<Product, 'id' | 'title'>,
  previous: ProductOverride,
): Promise<void> {
  await appendServerAudit(tx, audit.request, audit.actor, {
    action: 'product.override_reset', entityType: 'product', entityId: product.id,
    entityTitle: product.title, before: { override: previous }, after: { override: null },
  })
}
