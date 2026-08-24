'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { logAdminAction } from '@/lib/admin-log-store'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'
import { PromoMultiSelect, usePromoCatalogOptions } from '@/components/admin/promo/PromoMultiSelect'
import { PromoProductPicker } from '@/components/admin/promo/PromoProductPicker'
import { PromoProductsPreview } from '@/components/admin/promo/PromoProductsPreview'
import { useAdminLocale } from '@/lib/use-admin-locale'

type PromoCodeItem = {
  id: string
  code: string
  discount: number
  discountType: 'percentage' | 'fixed'
  discountValue: number | null
  maxDiscount: number | null
  minOrder: number
  minEligibleAmount: number
  maxUses: number | null
  usedCount: number
  expiresAt: string | null
  startsAt: string | null
  perUserLimit: number | null
  appliesTo: 'all' | 'products' | 'brands' | 'categories' | 'rules'
  productIds: string[]
  brands: string[]
  categories: string[]
  subcategories: string[]
  excludedProductIds: string[]
  excludeSaleItems: boolean
  firstOrderOnly: boolean
  active: boolean
  description: string
}

const emptyForm = (): Omit<PromoCodeItem, 'id'> => ({
  code: '',
  discount: 10,
  discountType: 'percentage', discountValue: 10, maxDiscount: null,
  minOrder: 0,
  minEligibleAmount: 0,
  maxUses: null,
  usedCount: 0,
  expiresAt: null,
  startsAt: null, perUserLimit: null, appliesTo: 'all', productIds: [], brands: [], categories: [], subcategories: [],
  excludedProductIds: [], excludeSaleItems: false, firstOrderOnly: false,
  active: true,
  description: ''
})

export default function AdminDiscountsPage(): React.ReactElement {
  const { locale, l } = useAdminLocale()
  const confirmAction = useAdminConfirm()
  const [items, setItems] = useState<PromoCodeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formClosing, setFormClosing] = useState(false)
  const [formCollapsed, setFormCollapsed] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<PromoCodeItem, 'id'>>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const catalogOptions = usePromoCatalogOptions()
  const closeTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
  }, [])

  const load = useCallback(async (showLoadingState = true) => {
    if (showLoadingState) setLoading(true)
    try {
      const res = await fetch('/api/admin/promo-codes')
      const data = await res.json()
      setItems(Array.isArray(data) ? data.map((item: Partial<PromoCodeItem>) => ({
        ...item,
        discountType: item.discountType ?? 'percentage',
        discountValue: item.discountValue ?? item.discount ?? 0,
        minEligibleAmount: item.minEligibleAmount ?? 0,
        appliesTo: item.appliesTo ?? 'all',
        productIds: item.productIds ?? [],
        brands: item.brands ?? [],
        categories: item.categories ?? [],
        subcategories: item.subcategories ?? [],
        excludedProductIds: item.excludedProductIds ?? [],
        excludeSaleItems: item.excludeSaleItems ?? false,
        firstOrderOnly: item.firstOrderOnly ?? false,
      } as PromoCodeItem)) : [])
    } catch {
      setError(l('Ошибка загрузки данных', 'Failed to load data', 'Neizdevās ielādēt datus'))
    } finally {
      if (showLoadingState) setLoading(false)
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
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    setFormClosing(false)
    setEditId(null)
    setForm(emptyForm())
    setFormCollapsed(false)
    setShowForm(true)
  }

  function openEdit(item: PromoCodeItem) {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    setFormClosing(false)
    setEditId(item.id)
    setForm({
      code: item.code,
      discount: item.discount,
      discountType: item.discountType ?? 'percentage', discountValue: item.discountValue ?? item.discount,
      maxDiscount: item.maxDiscount ?? null,
      minOrder: item.minOrder,
      minEligibleAmount: item.minEligibleAmount ?? 0,
      maxUses: item.maxUses,
      usedCount: item.usedCount,
      expiresAt: item.expiresAt,
      startsAt: item.startsAt ?? null, perUserLimit: item.perUserLimit ?? null, appliesTo: item.appliesTo ?? 'all',
      productIds: item.productIds ?? [], brands: item.brands ?? [], categories: item.categories ?? [], subcategories: item.subcategories ?? [],
      excludedProductIds: item.excludedProductIds ?? [], excludeSaleItems: item.excludeSaleItems ?? false,
      firstOrderOnly: item.firstOrderOnly ?? false,
      active: item.active,
      description: item.description
    })
    setFormCollapsed(false)
    setShowForm(true)
  }

  function cancelForm() {
    setFormClosing(true)
    closeTimerRef.current = window.setTimeout(() => {
      setShowForm(false)
      setFormClosing(false)
      setFormCollapsed(false)
      setEditId(null)
      setForm(emptyForm())
      closeTimerRef.current = null
    }, 260)
  }

  async function closeFormWithWarning() {
    if (showForm) {
      const decision = await confirmAction({
        title: editId ? l('Закрыть редактирование?', 'Close editing?', 'Aizvērt rediģēšanu?') : l('Отменить создание промокода?', 'Cancel promo code creation?', 'Atcelt promokoda izveidi?'),
        description: editId ? l('Внесённые изменения не сохранятся.', 'Your changes will not be saved.', 'Veiktās izmaiņas netiks saglabātas.') : l('Заполненные данные нового промокода будут потеряны.', 'The entered promo code data will be lost.', 'Ievadītie jaunā promokoda dati tiks zaudēti.'),
        affected: [form.code || editId || l('Новый промокод', 'New promo code', 'Jauns promokods')],
        destructive: true,
      })
      if (!decision.confirmed) return
    }
    cancelForm()
  }

  async function handleOpenCreate() {
    if (editId) {
      const decision = await confirmAction({
        title: l('Перейти к новому промокоду?', 'Switch to a new promo code?', 'Pāriet uz jaunu promokodu?'),
        description: l('Изменения редактируемого промокода не сохранятся.', 'Changes to the current promo code will not be saved.', 'Pašreizējā promokoda izmaiņas netiks saglabātas.'),
        affected: [form.code || editId],
        destructive: true,
      })
      if (!decision.confirmed) return
    }
    openCreate()
  }

  async function handleSave() {
    if (!form.code.trim()) return
    const scopeIsEmpty = (form.appliesTo === 'products' && form.productIds.length === 0)
      || (form.appliesTo === 'brands' && form.brands.length === 0)
      || (form.appliesTo === 'categories' && form.categories.length === 0)
      || (form.appliesTo === 'rules' && form.brands.length + form.categories.length + form.subcategories.length === 0)
    if (scopeIsEmpty) {
      setError(l('Выберите хотя бы один товар, бренд или категорию для выбранной области действия', 'Select at least one product, brand or category for the chosen scope', 'Izvēlētajam tvērumam atlasiet vismaz vienu produktu, zīmolu vai kategoriju'))
      return
    }
    // Client-side duplicate check
    if (!editId) {
      const code = form.code.trim().toUpperCase()
      if (items.some((item) => item.code === code)) {
        setError(l(`Промокод «${code}» уже существует`, `Promo code “${code}” already exists`, `Promokods “${code}” jau pastāv`))
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      if (editId) {
        await fetch(`/api/admin/promo-codes/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })
      } else {
        const res = await fetch('/api/admin/promo-codes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })
        if (res.status === 409) {
          setError(l(`Промокод «${form.code.trim().toUpperCase()}» уже существует`, `Promo code “${form.code.trim().toUpperCase()}” already exists`, `Promokods “${form.code.trim().toUpperCase()}” jau pastāv`))
          setSaving(false)
          return
        }
      }
      await load(false)
      logAdminAction(editId ? 'promo.updated' : 'promo.created', {
        type: 'promo', id: editId ?? form.code, title: form.code.trim().toUpperCase(),
      }, { after: { discount: form.discount, active: form.active } })
      cancelForm()
    } catch {
      setError(l('Ошибка сохранения', 'Failed to save', 'Saglabāšanas kļūda'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const target = items.find((i) => i.id === id)
    const decision = await confirmAction({ title: l('Удалить промокод?', 'Delete promo code?', 'Dzēst promokodu?'), description: l('Код перестанет применяться к новым заказам. Действие необратимо.', 'The code will no longer apply to new orders. This action cannot be undone.', 'Kods vairs netiks piemērots jauniem pasūtījumiem. Šo darbību nevar atsaukt.'), affected: [target?.code ?? id], confirmText: l('УДАЛИТЬ', 'DELETE', 'DZĒST'), requireReason: true, destructive: true })
    if (!decision.confirmed) return
    await fetch(`/api/admin/promo-codes/${id}`, { method: 'DELETE' })
    logAdminAction('promo.deleted', { type: 'promo', id, title: target?.code })
    await load(false)
  }

  async function handleToggle(item: PromoCodeItem) {
    await fetch(`/api/admin/promo-codes/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active })
    })
    logAdminAction('promo.toggled', { type: 'promo', id: item.id, title: item.code }, {
      before: { active: item.active }, after: { active: !item.active },
    })
    await load(false)
  }

  const selectCls = 'w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm'
  const numberInputCls = '[&::-webkit-inner-spin-button]:opacity-100 [&::-webkit-outer-spin-button]:opacity-100'

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Link href="/admin" className="text-sm text-primary hover:underline mb-1 inline-block">
              ← {l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}
            </Link>
            <h1 className="text-2xl font-bold text-foreground">{l('Промокоды', 'Promo codes', 'Promokodi')}</h1>
          </div>
          <Button onClick={() => void handleOpenCreate()} disabled={showForm && !editId}>+ {l('Добавить промокод', 'Add promo code', 'Pievienot promokodu')}</Button>
        </div>

        {error && (
          <div className="ui-disclosure-in rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className={`${formClosing ? 'ui-panel-out pointer-events-none' : 'ui-panel-in'} rounded-xl shadow-sm transition-[padding,background-color,box-shadow] duration-[280ms] ease-in-out ${formCollapsed && !editId ? 'p-3' : 'p-6'} ${editId
            ? 'bg-rose-50/80 ring-1 ring-rose-200/70 dark:bg-rose-950/20 dark:ring-rose-800/50'
            : 'border border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
          }`}>
            <div className={`${formCollapsed && !editId ? 'flex flex-wrap items-center gap-3' : '-mx-6 -mt-6 flex flex-wrap items-center gap-3 rounded-t-xl border-b border-border/70 bg-background/55 px-6 py-4 backdrop-blur-sm'}`}>
              <h2 className="text-lg font-semibold text-foreground">
                {editId ? l('Редактировать промокод', 'Edit promo code', 'Rediģēt promokodu') : l('Новый промокод', 'New promo code', 'Jauns promokods')}
              </h2>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => {
                  setFormCollapsed((value) => !value)
                }}>
                  {formCollapsed ? l('Развернуть', 'Expand', 'Izvērst') : l('Свернуть', 'Collapse', 'Sakļaut')}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving || !form.code.trim()}>
                  {saving ? l('Сохранение...', 'Saving...', 'Saglabāšana...') : editId ? l('Сохранить', 'Save', 'Saglabāt') : l('Создать', 'Create', 'Izveidot')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void closeFormWithWarning()}>{editId ? l('Закрыть', 'Close', 'Aizvērt') : l('Отмена', 'Cancel', 'Atcelt')}</Button>
              </div>
            </div>
            <div className={`grid transition-[grid-template-rows,opacity] duration-[280ms] ease-in-out ${formCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`} aria-hidden={formCollapsed} inert={formCollapsed ? true : undefined}>
            <div className="min-h-0 overflow-hidden">
            <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-4">
              <label htmlFor="admin-discount-field-1" className="space-y-1">
                <span className="text-sm text-muted-foreground">{l('Код', 'Code', 'Kods')} *</span>
                <Input id="admin-discount-field-1"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="WELCOME10"
                />
              </label>
              <label htmlFor="admin-discount-field-2" className="space-y-1">
                <span className="text-sm text-muted-foreground">{l('Размер скидки', 'Discount amount', 'Atlaides apmērs')}, {form.discountType === 'fixed' ? '€' : '%'}</span>
                <Input id="admin-discount-field-2"
                  type="number"
                  className={numberInputCls}
                  min={1}
                  max={form.discountType === 'percentage' ? 100 : undefined}
                  value={form.discountValue ?? form.discount}
                  onChange={(e) => setForm((f) => ({ ...f, discountValue: Number(e.target.value), discount: Number(e.target.value) }))}
                />
              </label>
              <label htmlFor="admin-discount-field-3" className="space-y-1">
                <span className="text-sm text-muted-foreground">{l('Мин. сумма заказа, €', 'Minimum order, €', 'Minimālā pasūtījuma summa, €')}</span>
                <Input id="admin-discount-field-3"
                  type="number"
                  className={numberInputCls}
                  min={0}
                  value={form.minOrder}
                  onChange={(e) => setForm((f) => ({ ...f, minOrder: Number(e.target.value) }))}
                />
              </label>
              <label htmlFor="admin-discount-field-4" className="space-y-1">
                <span className="text-sm text-muted-foreground">{l('Макс. использований (пусто = без лимита)', 'Maximum uses (empty = unlimited)', 'Maks. lietojumu skaits (tukšs = neierobežots)')}</span>
                <Input id="admin-discount-field-4"
                  type="number"
                  className={numberInputCls}
                  min={1}
                  value={form.maxUses ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value === '' ? null : Number(e.target.value) }))}
                  placeholder={l('Без лимита', 'Unlimited', 'Bez ierobežojuma')}
                />
              </label>
              <label htmlFor="admin-discount-field-5" className="space-y-1">
                <span className="text-sm text-muted-foreground">{l('Действует до', 'Valid until', 'Derīgs līdz')}</span>
                <Input id="admin-discount-field-5"
                  type="date"
                  value={form.expiresAt?.slice(0, 10) ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value || null }))}
                />
              </label>
              <label htmlFor="admin-discount-field-6" className="space-y-1">
                <span className="text-sm text-muted-foreground">{l('Статус', 'Status', 'Statuss')}</span>
                <Select value={form.active ? 'true' : 'false'} onValueChange={(v) => setForm((f) => ({ ...f, active: v === 'true' }))}>
                  <SelectTrigger id="admin-discount-field-6" className={selectCls}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">{l('Активен', 'Active', 'Aktīvs')}</SelectItem>
                    <SelectItem value="false">{l('Скрыт', 'Hidden', 'Paslēpts')}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-sm text-muted-foreground">{l('Тип скидки', 'Discount type', 'Atlaides veids')}</span>
                <Select value={form.discountType} onValueChange={(v) => setForm((f) => ({ ...f, discountType: v as 'percentage' | 'fixed' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">{l('Процент', 'Percentage', 'Procenti')}</SelectItem><SelectItem value="fixed">{l('Фиксированная сумма', 'Fixed amount', 'Fiksēta summa')}</SelectItem></SelectContent>
                </Select>
              </label>
              {form.discountType === 'percentage' && <label className="space-y-1"><span className="text-sm text-muted-foreground">{l('Максимальная скидка, €', 'Maximum discount, €', 'Maksimālā atlaide, €')}</span><Input type="number" className={numberInputCls} min={0} value={form.maxDiscount ?? ''} onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value ? Number(e.target.value) : null }))} /></label>}
              <label className="space-y-1"><span className="text-sm text-muted-foreground">{l('Мин. сумма подходящих товаров, €', 'Minimum eligible product amount, €', 'Minimālā atbilstošo preču summa, €')}</span><Input type="number" className={numberInputCls} min={0} value={form.minEligibleAmount} onChange={(e) => setForm((f) => ({ ...f, minEligibleAmount: Number(e.target.value) }))} /></label>
              <label className="space-y-1"><span className="text-sm text-muted-foreground">{l('Лимит на клиента', 'Limit per customer', 'Limits vienam klientam')}</span><Input type="number" className={numberInputCls} min={1} value={form.perUserLimit ?? ''} placeholder={l('Без лимита', 'Unlimited', 'Bez ierobežojuma')} onChange={(e) => setForm((f) => ({ ...f, perUserLimit: e.target.value ? Number(e.target.value) : null }))} /></label>
              <label className="space-y-1"><span className="text-sm text-muted-foreground">{l('Начало действия', 'Valid from', 'Derīgs no')}</span><Input type="date" value={form.startsAt?.slice(0, 10) ?? ''} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value || null }))} /></label>
              <label className="space-y-1"><span className="text-sm text-muted-foreground">{l('Область действия', 'Scope', 'Darbības tvērums')}</span><Select value={form.appliesTo} onValueChange={(v) => setForm((f) => ({ ...f, appliesTo: v as PromoCodeItem['appliesTo'] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{l('Вся корзина', 'Entire cart', 'Viss grozs')}</SelectItem><SelectItem value="products">{l('Отдельные товары', 'Specific products', 'Atsevišķas preces')}</SelectItem><SelectItem value="rules">{l('Бренды и подкатегории', 'Brands and subcategories', 'Zīmoli un apakškategorijas')}</SelectItem><SelectItem value="brands">{l('Только бренды', 'Brands only', 'Tikai zīmoli')}</SelectItem><SelectItem value="categories">{l('Только категории', 'Categories only', 'Tikai kategorijas')}</SelectItem></SelectContent></Select></label>
              {form.appliesTo === 'products' && <PromoProductPicker label={l('Товары, на которые действует скидка', 'Discounted products', 'Preces, kurām piemēro atlaidi')} selected={form.productIds} onChange={(productIds) => setForm((f) => ({ ...f, productIds }))} />}
              {(form.appliesTo === 'brands' || form.appliesTo === 'rules') && <PromoMultiSelect label={l('Бренды', 'Brands', 'Zīmoli')} options={catalogOptions.brands} selected={form.brands} onChange={(brands) => setForm((f) => ({ ...f, brands }))} placeholder={l('Найти бренд…', 'Find brand…', 'Meklēt zīmolu…')} />}
              {(form.appliesTo === 'categories' || form.appliesTo === 'rules') && <PromoMultiSelect label={l('Категории (необязательно)', 'Categories (optional)', 'Kategorijas (neobligāti)')} options={catalogOptions.categories} selected={form.categories} onChange={(categories) => setForm((f) => ({ ...f, categories }))} placeholder={l('Найти категорию…', 'Find category…', 'Meklēt kategoriju…')} />}
              {form.appliesTo === 'rules' && <PromoMultiSelect label={l('Подкатегории (необязательно)', 'Subcategories (optional)', 'Apakškategorijas (neobligāti)')} options={catalogOptions.subcategories} selected={form.subcategories} onChange={(subcategories) => setForm((f) => ({ ...f, subcategories }))} placeholder={l('Найти подкатегорию…', 'Find subcategory…', 'Meklēt apakškategoriju…')} />}
              <PromoProductPicker label={l('Исключённые товары', 'Excluded products', 'Izslēgtās preces')} selected={form.excludedProductIds} onChange={(excludedProductIds) => setForm((f) => ({ ...f, excludedProductIds }))} />
              <label htmlFor="admin-discount-field-7" className="space-y-1 sm:col-span-2">
                <span className="text-sm text-muted-foreground">{l('Краткое описание', 'Short description', 'Īss apraksts')}</span>
                <Input id="admin-discount-field-7" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder={l('Например: скидка для новых клиентов', 'For example: discount for new customers', 'Piemēram: atlaide jaunajiem klientiem')} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.excludeSaleItems} onChange={(e) => setForm((f) => ({ ...f, excludeSaleItems: e.target.checked }))} />{l('Не применять к уценённым товарам', 'Exclude sale products', 'Neattiecināt uz precēm ar atlaidi')}</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => setForm((f) => ({ ...f, firstOrderOnly: e.target.checked }))} />{l('Только первый заказ', 'First order only', 'Tikai pirmajam pasūtījumam')}</label>
            </div>
            <div className="pt-4">
              <PromoProductsPreview categories={form.categories} subcategories={form.subcategories} brands={form.brands} productIds={form.productIds} excludedProductIds={form.excludedProductIds} excludeSaleItems={form.excludeSaleItems} />
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
            <p className="text-muted-foreground text-sm">{l('Промокодов пока нет.', 'No promo codes yet.', 'Promokodu vēl nav.')}</p>
            <p className="text-muted-foreground text-xs mt-1">{l('Нажмите «+ Добавить промокод», чтобы создать первый.', 'Click “+ Add promo code” to create the first one.', 'Noklikšķiniet “+ Pievienot promokodu”, lai izveidotu pirmo.')}</p>
          </div>
        ) : (
          <div className="ui-disclosure-in grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex h-full flex-col rounded-xl bg-rose-50/80 p-5 shadow-sm ring-1 ring-rose-200/70 dark:bg-rose-950/20 dark:ring-rose-800/50 ${item.active ? '' : 'opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-lg border border-primary/25 bg-background/80 px-3 py-1 font-mono text-xl font-bold tracking-wider text-primary shadow-sm">{item.code}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'}`}>
                    {item.active ? l('Активен', 'Active', 'Aktīvs') : l('Скрыт', 'Hidden', 'Paslēpts')}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-3 text-sm">
                  <span className="text-2xl font-bold text-primary">{item.discountType === 'fixed' ? `€${item.discountValue ?? item.discount}` : `${item.discountValue ?? item.discount}%`}</span>
                  {item.description && <span className="text-muted-foreground">{item.description}</span>}
                </div>

                <div className="mt-3 text-xs text-muted-foreground space-y-0.5">
                  {item.minOrder > 0 && <p>{l('Мин. заказ:', 'Minimum order:', 'Min. pasūtījums:')} €{item.minOrder}</p>}
                  <p>{item.appliesTo === 'all' ? l('На всю корзину', 'Entire cart', 'Visam grozam') : item.appliesTo === 'products' ? l(`На товары: ${item.productIds?.length ?? 0}`, `Products: ${item.productIds?.length ?? 0}`, `Preces: ${item.productIds?.length ?? 0}`) : item.appliesTo === 'brands' ? l(`Бренды: ${(item.brands ?? []).join(', ')}`, `Brands: ${(item.brands ?? []).join(', ')}`, `Zīmoli: ${(item.brands ?? []).join(', ')}`) : item.appliesTo === 'categories' ? l(`Категории: ${(item.categories ?? []).join(', ')}`, `Categories: ${(item.categories ?? []).join(', ')}`, `Kategorijas: ${(item.categories ?? []).join(', ')}`) : l('Комбинация условий', 'Combined conditions', 'Nosacījumu kombinācija')}</p>
                  {(item.subcategories?.length ?? 0) > 0 && <p>{l('Подкатегории:', 'Subcategories:', 'Apakškategorijas:')} {item.subcategories.join(', ')}</p>}
                  {item.maxDiscount != null && item.discountType === 'percentage' && <p>{l('Макс. скидка:', 'Maximum discount:', 'Maks. atlaide:')} €{item.maxDiscount}</p>}
                  {item.perUserLimit != null && <p>{l(`На клиента: до ${item.perUserLimit} раз`, `Per customer: up to ${item.perUserLimit} times`, `Vienam klientam: līdz ${item.perUserLimit} reizēm`)}</p>}
                  {item.firstOrderOnly && <p>{l('Только первый заказ', 'First order only', 'Tikai pirmajam pasūtījumam')}</p>}
                  {item.excludeSaleItems && <p>{l('Без уценённых товаров', 'Sale products excluded', 'Bez precēm ar atlaidi')}</p>}
                  {item.maxUses !== null && (
                    <p>{l('Лимит:', 'Limit:', 'Limits:')} {item.usedCount}/{item.maxUses} {l('использований', 'uses', 'lietojumi')}</p>
                  )}
                  {item.maxUses === null && item.usedCount > 0 && (
                    <p>{l('Использований:', 'Uses:', 'Lietojumi:')} {item.usedCount}</p>
                  )}
                  {item.expiresAt && <p>{l('До:', 'Until:', 'Līdz:')} {new Date(item.expiresAt).toLocaleDateString(locale)}</p>}
                </div>

                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button size="sm" variant="outline" onClick={() => openEdit(item)}>{l('Изменить', 'Edit', 'Rediģēt')}</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggle(item)}
                    className={item.active ? 'text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-900/20' : 'text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/20'}
                  >
                    {item.active ? l('Скрыть', 'Hide', 'Paslēpt') : l('Активировать', 'Activate', 'Aktivizēt')}
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
            ))}
          </div>
        )}
      </main>
    </AdminGate>
  )
}
