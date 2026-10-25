'use client'

import React from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'
import { useTranslation } from '@/lib/use-translation'
import { DELIVERY_METHOD_LABEL_KEYS } from '@/lib/delivery'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DEFAULT_COMMERCE_SETTINGS, getCommerceSettingsIssues, type CommerceSettings, type DeliveryMethodId } from '@/lib/commerce-settings'
import { useAdminLocale } from '@/lib/use-admin-locale'

type OwnedKey = Exclude<keyof CommerceSettings, 'version'>
type Scope = 'delivery' | 'payment'

// Each admin page owns only its own slice of the shared commerce settings record.
const OWNED_KEYS: Record<Scope, OwnedKey[]> = { delivery: ['general', 'delivery'], payment: ['payment', 'providers'] }

export function NumberField({ value, onChange, placeholder, disabled = false }: { value: number | null; onChange: (value: number | null) => void; placeholder: string; disabled?: boolean }): React.ReactElement {
  return <Input disabled={disabled} type="number" min={0} step={0.01} value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} />
}

export function useDeliveryNames(): Record<DeliveryMethodId, string> {
  const { t } = useTranslation()
  const { l } = useAdminLocale()
  return { pickup: l('Самовывоз', 'Pickup', 'Saņemšana veikalā'), courier_riga: l('Курьер по Риге', 'Courier in Riga', 'Kurjers Rīgā'), courier_latvia: l('Курьер по Латвии', 'Courier in Latvia', 'Kurjers Latvijā'), omniva: 'Omniva', dpd: 'DPD', venipak: 'Venipak', venipak_courier: t(DELIVERY_METHOD_LABEL_KEYS.venipak_courier), unisend: t(DELIVERY_METHOD_LABEL_KEYS.unisend), unisend_courier: t(DELIVERY_METHOD_LABEL_KEYS.unisend_courier), expresspasts: t(DELIVERY_METHOD_LABEL_KEYS.expresspasts), expresspasts_courier: t(DELIVERY_METHOD_LABEL_KEYS.expresspasts_courier) }
}

async function fetchSettings(): Promise<CommerceSettings> {
  const response = await fetch('/api/admin/shipping', { cache: 'no-store' })
  if (!response.ok) throw new Error('load_failed')
  return await response.json() as CommerceSettings
}

type SaveMessage = { text: string; ok: boolean } | null

export function useCommerceSettingsEditor(scope: Scope): { settings: CommerceSettings; setSettings: React.Dispatch<React.SetStateAction<CommerceSettings>>; loading: boolean; saving: boolean; canSave: boolean; message: SaveMessage; save: () => Promise<void> } {
  const { l } = useAdminLocale()
  const [settings, setSettings] = React.useState<CommerceSettings>(DEFAULT_COMMERCE_SETTINGS)
  const [loading, setLoading] = React.useState(true)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState<SaveMessage>(null)

  React.useEffect(() => {
    fetchSettings().then(setSettings).catch(() => {
      setLoadFailed(true)
      setMessage({ text: l('Не удалось загрузить настройки. Показан безопасный черновик, сохранение отключено — обновите страницу.', 'Failed to load settings. A safe draft is shown and saving is disabled — reload the page.', 'Neizdevās ielādēt iestatījumus. Tiek rādīts drošs melnraksts, saglabāšana ir atspējota — pārlādējiet lapu.'), ok: false })
    }).finally(() => setLoading(false))
  }, [l])

  const canSave = !loading && !loadFailed

  const save = async () => {
    // The draft shown after a failed load is not the stored data; saving it would overwrite real settings.
    if (!canSave) return
    setSaving(true); setMessage(null)
    try {
      // Re-read the latest record so saving this page never overwrites the other page's section.
      const latest = await fetchSettings()
      const merged: CommerceSettings = { ...latest }
      for (const key of OWNED_KEYS[scope]) Object.assign(merged, { [key]: settings[key] })
      const response = await fetch('/api/admin/shipping', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merged) })
      if (!response.ok) throw new Error('save_failed')
      setSettings(merged)
      setMessage({ text: l('Настройки сохранены', 'Settings saved', 'Iestatījumi saglabāti'), ok: true })
    } catch { setMessage({ text: l('Не удалось сохранить настройки', 'Failed to save settings', 'Neizdevās saglabāt iestatījumus'), ok: false }) }
    finally { setSaving(false) }
  }

  return { settings, setSettings, loading, saving, canSave, message, save }
}

export function CommerceSettingsHeader({ title, saving, canSave, onSave }: { title: string; saving: boolean; canSave: boolean; onSave: () => void }): React.ReactElement {
  const { l } = useAdminLocale()
  return <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold md:text-3xl">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{l('Рабочий черновик Hairshop‑Pro. Секретные API-ключи здесь не хранятся.', 'Hairshop‑Pro working draft. Secret API keys are not stored here.', 'Hairshop‑Pro darba melnraksts. Slepenās API atslēgas šeit netiek glabātas.')}</p></div><div className="flex gap-2"><Button asChild variant="outline"><Link href="/delivery-payment" target="_blank">{l('Страница для клиента', 'Customer page', 'Klienta lapa')} <ExternalLink className="ml-2 h-4 w-4" /></Link></Button><Button onClick={onSave} disabled={saving || !canSave}>{saving ? l('Сохранение…', 'Saving…', 'Saglabāšana…') : l('Сохранить', 'Save', 'Saglabāt')}</Button></div></header>
}

export function CommerceSettingsMessage({ message }: { message: SaveMessage }): React.ReactElement | null {
  if (!message) return null
  return <div className={`rounded-lg border p-3 text-sm ${message.ok ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'}`}>{message.text}</div>
}

export function CommerceSettingsIssues({ settings, scope }: { settings: CommerceSettings; scope: Scope }): React.ReactElement {
  const { l, language } = useAdminLocale()
  const issues = getCommerceSettingsIssues(settings, language, scope)
  return <section className={`rounded-xl border p-4 ${issues.length ? 'border-amber-300 bg-amber-50/70 dark:bg-amber-950/20' : 'border-green-300 bg-green-50/70 dark:bg-green-950/20'}`}><div className="flex items-center gap-2 font-semibold">{issues.length ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-green-600" />}{issues.length ? `${l('До запуска нужно закрыть:', 'Issues to resolve before launch:', 'Pirms palaišanas jānovērš:')} ${issues.length}` : l('Конфигурация готова к запуску', 'Configuration is ready for launch', 'Konfigurācija ir gatava palaišanai')}</div>{issues.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-6 text-sm text-muted-foreground">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}</section>
}

export function CommerceSettingsSaveBar({ saving, canSave, onSave }: { saving: boolean; canSave: boolean; onSave: () => void }): React.ReactElement {
  const { l } = useAdminLocale()
  return <div className="sticky bottom-4 flex justify-end"><Button size="lg" onClick={onSave} disabled={saving || !canSave}>{saving ? l('Сохранение…', 'Saving…', 'Saglabāšana…') : l('Сохранить настройки', 'Save settings', 'Saglabāt iestatījumus')}</Button></div>
}
