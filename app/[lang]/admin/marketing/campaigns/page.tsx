'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'
import { PromoMultiSelect, usePromoCatalogOptions } from '@/components/admin/promo/PromoMultiSelect'
import { PromoProductsPreview } from '@/components/admin/promo/PromoProductsPreview'
import { useAdminLocale } from '@/lib/use-admin-locale'

type CampaignType = 'discount' | 'gift' | 'bundle' | 'free_shipping'

type PromoCampaign = {
  id: string
  name: string
  description: string
  type: CampaignType
  discountPercent: number
  startDate: string
  endDate: string
  active: boolean
  targetCategories: string[]
  targetSubcategories: string[]
  targetBrands: string[]
  minOrderAmount: number
  createdAt: string
  updatedAt: string
}

const emptyForm = (): Omit<PromoCampaign, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: '',
  description: '',
  type: 'discount',
  discountPercent: 10,
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  active: true,
  targetCategories: [],
  targetSubcategories: [],
  targetBrands: [],
  minOrderAmount: 0
})

type Localize = (ru: string, en: string, lv: string) => string

function getCampaignStatus(campaign: PromoCampaign, l: Localize): { label: string; cls: string } {
  if (!campaign.active) return { label: l('Неактивна', 'Inactive', 'Neaktīva'), cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' }
  const now = new Date()
  const start = new Date(campaign.startDate)
  const end = campaign.endDate ? new Date(campaign.endDate) : null
  if (now < start) return { label: l('Предстоящая', 'Upcoming', 'Gaidāma'), cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' }
  if (end && now > end) return { label: l('Завершена', 'Completed', 'Pabeigta'), cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' }
  return { label: l('Активна', 'Active', 'Aktīva'), cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' }
}

export default function AdminCampaignsPage(): React.ReactElement {
  const { locale, l } = useAdminLocale()
  const typeLabels: Record<CampaignType, string> = {
    discount: l('Скидка', 'Discount', 'Atlaide'), gift: l('Подарок', 'Gift', 'Dāvana'),
    bundle: l('Набор', 'Bundle', 'Komplekts'), free_shipping: l('Бесплатная доставка', 'Free delivery', 'Bezmaksas piegāde')
  }
  const confirmAction = useAdminConfirm()
  const [items, setItems] = useState<PromoCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formCollapsed, setFormCollapsed] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const catalogOptions = usePromoCatalogOptions()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/campaigns')
      const data = await res.json()
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setError(l('Ошибка загрузки данных', 'Failed to load data', 'Datu ielādes kļūda'))
    } finally {
      setLoading(false)
    }
  }, [l])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  function openCreate() {
    setEditId(null)
    setForm(emptyForm())
    setFormCollapsed(false)
    setShowForm(true)
  }

  function openEdit(item: PromoCampaign) {
    setEditId(item.id)
    setForm({
      name: item.name,
      description: item.description,
      type: item.type,
      discountPercent: item.discountPercent,
      startDate: item.startDate ? item.startDate.split('T')[0] : '',
      endDate: item.endDate ? item.endDate.split('T')[0] : '',
      active: item.active,
      targetCategories: item.targetCategories ?? [],
      targetSubcategories: item.targetSubcategories ?? [],
      targetBrands: item.targetBrands ?? [],
      minOrderAmount: item.minOrderAmount
    })
    setFormCollapsed(false)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditId(null)
    setForm(emptyForm())
    setFormCollapsed(false)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    if (form.endDate && form.endDate < form.startDate) {
      setError(l('Дата окончания не может быть раньше даты начала', 'The end date cannot be earlier than the start date', 'Beigu datums nevar būt agrāks par sākuma datumu'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      let response: Response
      if (editId) {
        response = await fetch(`/api/admin/campaigns/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })
      } else {
        response = await fetch('/api/admin/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })
      }
      if (!response.ok) throw new Error('save_failed')
      await load()
      cancelForm()
    } catch {
      setError(l('Ошибка сохранения', 'Failed to save', 'Saglabāšanas kļūda'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const decision = await confirmAction({ title: l('Удалить кампанию?', 'Delete campaign?', 'Dzēst kampaņu?'), description: l('Кампания и её настройки будут удалены без возможности восстановления.', 'The campaign and its settings will be deleted permanently.', 'Kampaņa un tās iestatījumi tiks neatgriezeniski dzēsti.'), affected: [id], confirmText: l('УДАЛИТЬ', 'DELETE', 'DZĒST'), requireReason: true, destructive: true })
    if (!decision.confirmed) return
    await fetch(`/api/admin/campaigns/${id}`, { method: 'DELETE' })
    await load()
  }

  async function handleToggle(item: PromoCampaign) {
    await fetch(`/api/admin/campaigns/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active })
    })
    await load()
  }

  const selectCls = 'w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm'

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Link href="/admin" className="text-sm text-primary hover:underline mb-1 inline-block">
              ← {l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}
            </Link>
            <h1 className="text-2xl font-bold text-foreground">{l('Промо-кампании', 'Promo campaigns', 'Promo kampaņas')}</h1>
          </div>
          <Button onClick={openCreate} disabled={showForm && !editId}>+ {l('Новая кампания', 'New campaign', 'Jauna kampaņa')}</Button>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className={`ui-panel-in rounded-xl shadow-sm transition-[padding,background-color,box-shadow] duration-[280ms] ease-in-out ${formCollapsed && !editId ? 'p-3' : 'p-6'} ${editId
            ? 'bg-rose-50/80 ring-1 ring-rose-200/70 dark:bg-rose-950/20 dark:ring-rose-800/50'
            : 'border border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
          }`}>
            <div className={`${formCollapsed && !editId ? 'flex flex-wrap items-center gap-3' : '-mx-6 -mt-6 flex flex-wrap items-center gap-3 rounded-t-xl border-b border-border/70 bg-background/55 px-6 py-4 backdrop-blur-sm'}`}>
              <h2 className="text-lg font-semibold text-foreground">
                {editId ? l('Редактировать промо-кампанию', 'Edit promo campaign', 'Rediģēt promo kampaņu') : l('Новая промо-кампания', 'New promo campaign', 'Jauna promo kampaņa')}
              </h2>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => setFormCollapsed((value) => !value)}>
                  {formCollapsed ? l('Развернуть', 'Expand', 'Izvērst') : l('Свернуть', 'Collapse', 'Sakļaut')}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
                  {saving ? l('Сохранение...', 'Saving...', 'Saglabā...') : editId ? l('Сохранить', 'Save', 'Saglabāt') : l('Создать', 'Create', 'Izveidot')}
                </Button>
                <Button size="sm" variant="outline" onClick={cancelForm}>{editId ? l('Закрыть', 'Close', 'Aizvērt') : l('Отмена', 'Cancel', 'Atcelt')}</Button>
              </div>
            </div>
            <div className={`grid transition-[grid-template-rows,opacity] duration-[280ms] ease-in-out ${formCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`} aria-hidden={formCollapsed} inert={formCollapsed ? true : undefined}>
            <div className="min-h-0 overflow-hidden">
            <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-4">
              <label htmlFor="admin-campaign-field-1" className="space-y-1 sm:col-span-2 lg:col-span-2">
                <span className="text-sm text-muted-foreground">{l('Название', 'Name', 'Nosaukums')} *</span>
                <Input id="admin-campaign-field-1"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={l('Весенняя акция', 'Spring promotion', 'Pavasara akcija')}
                />
              </label>
              <label htmlFor="admin-campaign-field-2" className="space-y-1 sm:col-span-2 lg:col-span-2">
                <span className="text-sm text-muted-foreground">{l('Описание', 'Description', 'Apraksts')}</span>
                <Textarea id="admin-campaign-field-2"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder={l('Подробное описание кампании', 'Detailed campaign description', 'Detalizēts kampaņas apraksts')}
                />
              </label>
              <label htmlFor="admin-campaign-field-3" className="space-y-1">
                <span className="text-sm text-muted-foreground">{l('Тип', 'Type', 'Veids')}</span>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as CampaignType }))}>
                  <SelectTrigger id="admin-campaign-field-3" className={selectCls}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discount">{l('Скидка', 'Discount', 'Atlaide')}</SelectItem>
                    <SelectItem value="free_shipping">{l('Бесплатная доставка', 'Free delivery', 'Bezmaksas piegāde')}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              {form.type === 'discount' && <label htmlFor="admin-campaign-field-4" className="space-y-1">
                <span className="text-sm text-muted-foreground">{l('Скидка, %', 'Discount, %', 'Atlaide, %')}</span>
                <Input id="admin-campaign-field-4"
                  type="number"
                  min={0}
                  max={100}
                  value={form.discountPercent}
                  onChange={(e) => setForm((f) => ({ ...f, discountPercent: Number(e.target.value) }))}
                />
              </label>}
              <label htmlFor="admin-campaign-field-5" className="space-y-1">
                <span className="text-sm text-muted-foreground">{l('Дата начала', 'Start date', 'Sākuma datums')}</span>
                <Input id="admin-campaign-field-5"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </label>
              <label htmlFor="admin-campaign-field-6" className="space-y-1">
                <span className="text-sm text-muted-foreground">{l('Дата окончания', 'End date', 'Beigu datums')}</span>
                <Input id="admin-campaign-field-6"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </label>
              <label htmlFor="admin-campaign-field-7" className="space-y-1">
                <span className="text-sm text-muted-foreground">{l('Мин. сумма заказа, €', 'Minimum order, €', 'Minimālais pasūtījums, €')}</span>
                <Input id="admin-campaign-field-7"
                  type="number"
                  min={0}
                  value={form.minOrderAmount}
                  onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: Number(e.target.value) }))}
                />
              </label>
              <label htmlFor="admin-campaign-field-8" className="space-y-1">
                <span className="text-sm text-muted-foreground">{l('Статус', 'Status', 'Statuss')}</span>
                <Select value={form.active ? 'true' : 'false'} onValueChange={(v) => setForm((f) => ({ ...f, active: v === 'true' }))}>
                  <SelectTrigger id="admin-campaign-field-8" className={selectCls}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">{l('Активна', 'Active', 'Aktīva')}</SelectItem>
                    <SelectItem value="false">{l('Неактивна', 'Inactive', 'Neaktīva')}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <div className="sm:col-span-2 lg:col-span-4 rounded-lg border border-border p-4">
                <p className="mb-3 text-sm text-muted-foreground">{l('Объекты акции (если ничего не выбрано — вся корзина). Условия разных групп применяются одновременно.', 'Promotion targets (if none are selected, the whole cart). Conditions from different groups apply together.', 'Akcijas objekti (ja nekas nav atlasīts — viss grozs). Dažādu grupu nosacījumi tiek piemēroti vienlaikus.')}</p>
                <div className="space-y-4">
                  <PromoMultiSelect label={l('Категории', 'Categories', 'Kategorijas')} options={catalogOptions.categories} selected={form.targetCategories} onChange={(targetCategories) => setForm((f) => ({ ...f, targetCategories }))} placeholder={l('Найти категорию…', 'Find category…', 'Meklēt kategoriju…')} />
                  <PromoMultiSelect label={l('Подкатегории', 'Subcategories', 'Apakškategorijas')} options={catalogOptions.subcategories} selected={form.targetSubcategories} onChange={(targetSubcategories) => setForm((f) => ({ ...f, targetSubcategories }))} placeholder={l('Найти подкатегорию…', 'Find subcategory…', 'Meklēt apakškategoriju…')} />
                  <PromoMultiSelect label={l('Бренды', 'Brands', 'Zīmoli')} options={catalogOptions.brands} selected={form.targetBrands} onChange={(targetBrands) => setForm((f) => ({ ...f, targetBrands }))} placeholder={l('Найти бренд…', 'Find brand…', 'Meklēt zīmolu…')} />
                </div>
              </div>
              <PromoProductsPreview categories={form.targetCategories} subcategories={form.targetSubcategories} brands={form.targetBrands} />
            </div>
            </div>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <p className="text-muted-foreground text-sm">{l('Загрузка...', 'Loading...', 'Ielāde...')}</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground text-sm">{l('Кампаний пока нет.', 'No campaigns yet.', 'Kampaņu vēl nav.')}</p>
            <p className="text-muted-foreground text-xs mt-1">{l('Нажмите «+ Новая кампания», чтобы создать первую.', 'Click “+ New campaign” to create the first one.', 'Noklikšķiniet “+ Jauna kampaņa”, lai izveidotu pirmo.')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const status = getCampaignStatus(item, l)
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-border bg-card p-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold text-foreground">{item.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.cls}`}>
                          {status.label}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary dark:bg-primary/40 dark:text-primary font-medium">
                          {typeLabels[item.type]}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                        {item.discountPercent > 0 && <span>{l('Скидка:', 'Discount:', 'Atlaide:')} {item.discountPercent}%</span>}
                        <span>{l('С', 'From', 'No')} {new Date(item.startDate).toLocaleDateString(locale)}</span>
                        {item.endDate && <span>{l('по', 'to', 'līdz')} {new Date(item.endDate).toLocaleDateString(locale)}</span>}
                        {item.minOrderAmount > 0 && <span>{l('Мин. заказ:', 'Minimum order:', 'Min. pasūtījums:')} €{item.minOrderAmount}</span>}
                        {(item.targetCategories?.length ?? 0) > 0 && <span>{l('Категории:', 'Categories:', 'Kategorijas:')} {item.targetCategories.map((value) => catalogOptions.categories.find((option) => option.value === value)?.label ?? value).join(', ')}</span>}
                        {(item.targetSubcategories?.length ?? 0) > 0 && <span>{l('Подкатегории:', 'Subcategories:', 'Apakškategorijas:')} {item.targetSubcategories.map((value) => catalogOptions.subcategories.find((option) => option.value === value)?.label ?? value).join(', ')}</span>}
                        {(item.targetBrands?.length ?? 0) > 0 && <span>{l('Бренды:', 'Brands:', 'Zīmoli:')} {item.targetBrands.join(', ')}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                      <Button size="sm" variant="outline" onClick={() => openEdit(item)}>{l('Изменить', 'Edit', 'Rediģēt')}</Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggle(item)}
                        className={item.active ? 'text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-900/20' : 'text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/20'}
                      >
                        {item.active ? l('Деактивировать', 'Deactivate', 'Deaktivizēt') : l('Активировать', 'Activate', 'Aktivizēt')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(item.id)}
                        className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20"
                      >
                        {l('Удалить', 'Delete', 'Dzēst')}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </AdminGate>
  )
}
