'use client'

import React from 'react'
import AdminGate from '@/components/admin/AdminGate'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import BrandLineDetailPanel from './BrandLineDetailPanel'
import BrandLineReviewQueue from './BrandLineReviewQueue'
import BrandLineTreePanel from './BrandLineTreePanel'
import { useBrandLinesAdmin } from './useBrandLinesAdmin'

export default function AdminBrandLinesPage(): React.ReactElement {
  const admin = useBrandLinesAdmin()
  const { l } = admin
  return (
    <AdminGate>
      <main className="w-full space-y-4 py-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h1 className="text-2xl font-bold text-foreground">{l('Товарные линейки', 'Product lines', 'Produktu līnijas')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {l(
              'Линейки и серии брендов из hairshop.lv и созданные вручную. Решения администратора синхронизация не перезаписывает.',
              'Brand lines and series from hairshop.lv and created manually. Synchronization never overwrites administrator decisions.',
              'Zīmolu līnijas un sērijas no hairshop.lv un manuāli izveidotās. Sinhronizācija nepārraksta administratora lēmumus.',
            )}
          </p>
        </div>
        {admin.message && (
          <p role={admin.message.kind === 'error' ? 'alert' : 'status'} className={`rounded-md border p-3 text-sm ${admin.message.kind === 'error' ? 'border-destructive text-destructive' : 'border-border'}`}>
            {admin.message.text}
          </p>
        )}
        {admin.loading ? (
          <p className="text-sm text-muted-foreground">{l('Загрузка…', 'Loading…', 'Ielādē…')}</p>
        ) : (
          <Tabs defaultValue="lines">
            <TabsList>
              <TabsTrigger value="lines">{l('Линейки', 'Lines', 'Līnijas')}</TabsTrigger>
              <TabsTrigger value="review">{l('Очередь проверки', 'Review queue', 'Pārbaudes rinda')} ({admin.openReviews})</TabsTrigger>
            </TabsList>
            <TabsContent value="lines">
              <div className="grid gap-4 lg:grid-cols-[minmax(18rem,26rem)_1fr]">
                <BrandLineTreePanel admin={admin} />
                <BrandLineDetailPanel admin={admin} />
              </div>
            </TabsContent>
            <TabsContent value="review">
              <BrandLineReviewQueue admin={admin} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </AdminGate>
  )
}
