import { CheckCircle2, Clock3, MapPin, XCircle } from 'lucide-react'
import type { JSX } from 'react'
import type { WarehouseAvailability } from '@/lib/warehouse-availability'

type Props = {
  language: 'ru' | 'en' | 'lv'
  available: boolean
  updatedAt: string | null
  stores: WarehouseAvailability[]
}

const COPY = {
  ru: { title: 'Наличие в магазинах', unavailable: 'Данные по магазинам временно недоступны.', inStock: 'В наличии', out: 'Нет в наличии', updated: 'Обновлено' },
  en: { title: 'Availability in stores', unavailable: 'Store availability is temporarily unavailable.', inStock: 'In stock', out: 'Out of stock', updated: 'Updated' },
  lv: { title: 'Pieejamība veikalos', unavailable: 'Informācija par pieejamību veikalos pašlaik nav pieejama.', inStock: 'Ir pieejams', out: 'Nav pieejams', updated: 'Atjaunināts' },
} as const

export function ProductStoreAvailability({ language, available, updatedAt, stores }: Props): JSX.Element {
  const copy = COPY[language]
  return (
    <section className="product-store-availability mt-6 rounded-lg border border-border bg-card p-4" aria-labelledby="store-availability-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="store-availability-title" className="text-lg font-semibold">{copy.title}</h2>
        {available && updatedAt ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.updated}: {new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(updatedAt))}
          </span>
        ) : null}
      </div>
      {!available ? (
        <p className="mt-3 text-sm text-muted-foreground">{copy.unavailable}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {stores.map((store) => {
            const inStock = (store.quantity ?? 0) > 0
            return (
              <li key={store.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{store.name}</p>
                  <p className="mt-0.5 pl-6 text-sm text-muted-foreground">{store.address}</p>
                </div>
                <span className={`flex shrink-0 items-center gap-1 text-sm font-medium ${inStock ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                  {inStock ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
                  {inStock ? copy.inStock : copy.out}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
