'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { logAdminAction } from '@/lib/admin-log-store'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'
import { PromoMultiSelect, usePromoCatalogOptions } from '@/components/admin/promo/PromoMultiSelect'
import { PromoProductPicker } from '@/components/admin/promo/PromoProductPicker'

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
  const confirmAction = useAdminConfirm()
  const [items, setItems] = useState<PromoCodeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formCollapsed, setFormCollapsed] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<PromoCodeItem, 'id'>>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const catalogOptions = usePromoCatalogOptions()

  async function load() {
    setLoading(true)
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
      setError('Ошибка загрузки данных')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [])

  function openCreate() {
    setEditId(null)
    setForm(emptyForm())
    setFormCollapsed(false)
    setShowForm(true)
  }

  function openEdit(item: PromoCodeItem) {
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
    setShowForm(false)
    setFormCollapsed(false)
    setEditId(null)
    setForm(emptyForm())
  }

  async function closeFormWithWarning() {
    if (showForm) {
      const decision = await confirmAction({
        title: editId ? 'Закрыть редактирование?' : 'Отменить создание промокода?',
        description: editId ? 'Внесённые изменения не сохранятся.' : 'Заполненные данные нового промокода будут потеряны.',
        affected: [form.code || editId || 'Новый промокод'],
        destructive: true,
      })
      if (!decision.confirmed) return
    }
    cancelForm()
  }

  async function handleOpenCreate() {
    if (editId) {
      const decision = await confirmAction({
        title: 'Перейти к новому промокоду?',
        description: 'Изменения редактируемого промокода не сохранятся.',
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
      setError('Выберите хотя бы один товар, бренд или категорию для выбранной области действия')
      return
    }
    // Client-side duplicate check
    if (!editId) {
      const code = form.code.trim().toUpperCase()
      if (items.some((item) => item.code === code)) {
        setError(`Промокод «${code}» уже существует`)
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
          setError(`Промокод «${form.code.trim().toUpperCase()}» уже существует`)
          setSaving(false)
          return
        }
      }
      await load()
      logAdminAction(editId ? 'promo.updated' : 'promo.created', {
        type: 'promo', id: editId ?? form.code, title: form.code.trim().toUpperCase(),
      }, { after: { discount: form.discount, active: form.active } })
      cancelForm()
    } catch {
      setError('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const target = items.find((i) => i.id === id)
    const decision = await confirmAction({ title: 'Удалить промокод?', description: 'Код перестанет применяться к новым заказам. Действие необратимо.', affected: [target?.code ?? id], requireReason: true, destructive: true })
    if (!decision.confirmed) return
    await fetch(`/api/admin/promo-codes/${id}`, { method: 'DELETE' })
    logAdminAction('promo.deleted', { type: 'promo', id, title: target?.code })
    await load()
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
    await load()
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
              ← Назад в админку
            </Link>
            <h1 className="text-2xl font-bold text-foreground">Промокоды</h1>
          </div>
          <Button onClick={() => void handleOpenCreate()} disabled={showForm && !editId}>+ Добавить промокод</Button>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className={`rounded-xl shadow-sm ${formCollapsed && !editId ? 'p-3' : 'p-6 space-y-4'} ${editId
            ? 'bg-rose-50/80 ring-1 ring-rose-200/70 dark:bg-rose-950/20 dark:ring-rose-800/50'
            : 'border border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
          }`}>
            <div className={`${formCollapsed && !editId ? 'flex flex-wrap items-center gap-3' : '-mx-6 -mt-6 flex flex-wrap items-center gap-3 rounded-t-xl border-b border-border/70 bg-background/55 px-6 py-4 backdrop-blur-sm'}`}>
              <h2 className="text-lg font-semibold text-foreground">
                {editId ? 'Редактировать промокод' : 'Новый промокод'}
              </h2>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => {
                  setFormCollapsed((value) => !value)
                }}>
                  {formCollapsed ? 'Развернуть' : 'Свернуть'}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving || !form.code.trim()}>
                  {saving ? 'Сохранение...' : editId ? 'Сохранить' : 'Создать'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void closeFormWithWarning()}>{editId ? 'Закрыть' : 'Отмена'}</Button>
              </div>
            </div>
            {!formCollapsed && <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label htmlFor="admin-discount-field-1" className="space-y-1">
                <span className="text-sm text-muted-foreground">Код *</span>
                <Input id="admin-discount-field-1"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="WELCOME10"
                />
              </label>
              <label htmlFor="admin-discount-field-2" className="space-y-1">
                <span className="text-sm text-muted-foreground">Размер скидки, {form.discountType === 'fixed' ? '€' : '%'}</span>
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
                <span className="text-sm text-muted-foreground">Мин. сумма заказа, €</span>
                <Input id="admin-discount-field-3"
                  type="number"
                  className={numberInputCls}
                  min={0}
                  value={form.minOrder}
                  onChange={(e) => setForm((f) => ({ ...f, minOrder: Number(e.target.value) }))}
                />
              </label>
              <label htmlFor="admin-discount-field-4" className="space-y-1">
                <span className="text-sm text-muted-foreground">Макс. использований (пусто = без лимита)</span>
                <Input id="admin-discount-field-4"
                  type="number"
                  className={numberInputCls}
                  min={1}
                  value={form.maxUses ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value === '' ? null : Number(e.target.value) }))}
                  placeholder="Без лимита"
                />
              </label>
              <label htmlFor="admin-discount-field-5" className="space-y-1">
                <span className="text-sm text-muted-foreground">Действует до</span>
                <Input id="admin-discount-field-5"
                  type="date"
                  value={form.expiresAt?.slice(0, 10) ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value || null }))}
                />
              </label>
              <label htmlFor="admin-discount-field-6" className="space-y-1">
                <span className="text-sm text-muted-foreground">Статус</span>
                <Select value={form.active ? 'true' : 'false'} onValueChange={(v) => setForm((f) => ({ ...f, active: v === 'true' }))}>
                  <SelectTrigger id="admin-discount-field-6" className={selectCls}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Активен</SelectItem>
                    <SelectItem value="false">Скрыт</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-sm text-muted-foreground">Тип скидки</span>
                <Select value={form.discountType} onValueChange={(v) => setForm((f) => ({ ...f, discountType: v as 'percentage' | 'fixed' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">Процент</SelectItem><SelectItem value="fixed">Фиксированная сумма</SelectItem></SelectContent>
                </Select>
              </label>
              {form.discountType === 'percentage' && <label className="space-y-1"><span className="text-sm text-muted-foreground">Максимальная скидка, €</span><Input type="number" className={numberInputCls} min={0} value={form.maxDiscount ?? ''} onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value ? Number(e.target.value) : null }))} /></label>}
              <label className="space-y-1"><span className="text-sm text-muted-foreground">Мин. сумма подходящих товаров, €</span><Input type="number" className={numberInputCls} min={0} value={form.minEligibleAmount} onChange={(e) => setForm((f) => ({ ...f, minEligibleAmount: Number(e.target.value) }))} /></label>
              <label className="space-y-1"><span className="text-sm text-muted-foreground">Лимит на клиента</span><Input type="number" className={numberInputCls} min={1} value={form.perUserLimit ?? ''} placeholder="Без лимита" onChange={(e) => setForm((f) => ({ ...f, perUserLimit: e.target.value ? Number(e.target.value) : null }))} /></label>
              <label className="space-y-1"><span className="text-sm text-muted-foreground">Начало действия</span><Input type="date" value={form.startsAt?.slice(0, 10) ?? ''} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value || null }))} /></label>
              <label className="space-y-1"><span className="text-sm text-muted-foreground">Область действия</span><Select value={form.appliesTo} onValueChange={(v) => setForm((f) => ({ ...f, appliesTo: v as PromoCodeItem['appliesTo'] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Вся корзина</SelectItem><SelectItem value="products">Отдельные товары</SelectItem><SelectItem value="rules">Бренды и подкатегории</SelectItem><SelectItem value="brands">Только бренды</SelectItem><SelectItem value="categories">Только категории</SelectItem></SelectContent></Select></label>
              {form.appliesTo === 'products' && <PromoProductPicker label="Товары, на которые действует скидка" selected={form.productIds} onChange={(productIds) => setForm((f) => ({ ...f, productIds }))} />}
              {(form.appliesTo === 'brands' || form.appliesTo === 'rules') && <PromoMultiSelect label="Бренды" options={catalogOptions.brands} selected={form.brands} onChange={(brands) => setForm((f) => ({ ...f, brands }))} placeholder="Найти бренд…" />}
              {(form.appliesTo === 'categories' || form.appliesTo === 'rules') && <PromoMultiSelect label="Категории (необязательно)" options={catalogOptions.categories} selected={form.categories} onChange={(categories) => setForm((f) => ({ ...f, categories }))} placeholder="Найти категорию…" />}
              {form.appliesTo === 'rules' && <PromoMultiSelect label="Подкатегории (необязательно)" options={catalogOptions.subcategories} selected={form.subcategories} onChange={(subcategories) => setForm((f) => ({ ...f, subcategories }))} placeholder="Найти подкатегорию…" />}
              <PromoProductPicker label="Исключённые товары" selected={form.excludedProductIds} onChange={(excludedProductIds) => setForm((f) => ({ ...f, excludedProductIds }))} />
              <label htmlFor="admin-discount-field-7" className="space-y-1 sm:col-span-2">
                <span className="text-sm text-muted-foreground">Краткое описание</span>
                <Input id="admin-discount-field-7" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Например: скидка для новых клиентов" />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.excludeSaleItems} onChange={(e) => setForm((f) => ({ ...f, excludeSaleItems: e.target.checked }))} />Не применять к уценённым товарам</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => setForm((f) => ({ ...f, firstOrderOnly: e.target.checked }))} />Только первый заказ</label>
            </div>
            </>}
          </div>
        )}

        {/* List */}
        {loading ? (
          <p className="text-muted-foreground text-sm">Загрузка...</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground text-sm">Промокодов пока нет.</p>
            <p className="text-muted-foreground text-xs mt-1">Нажмите «+ Добавить промокод», чтобы создать первый.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex h-full flex-col rounded-xl bg-rose-50/80 p-5 shadow-sm ring-1 ring-rose-200/70 dark:bg-rose-950/20 dark:ring-rose-800/50 ${item.active ? '' : 'opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-lg border border-primary/25 bg-background/80 px-3 py-1 font-mono text-xl font-bold tracking-wider text-primary shadow-sm">{item.code}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'}`}>
                    {item.active ? 'Активен' : 'Скрыт'}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-3 text-sm">
                  <span className="text-2xl font-bold text-primary">{item.discountType === 'fixed' ? `€${item.discountValue ?? item.discount}` : `${item.discountValue ?? item.discount}%`}</span>
                  {item.description && <span className="text-muted-foreground">{item.description}</span>}
                </div>

                <div className="mt-3 text-xs text-muted-foreground space-y-0.5">
                  {item.minOrder > 0 && <p>Мин. заказ: €{item.minOrder}</p>}
                  <p>{item.appliesTo === 'all' ? 'На всю корзину' : item.appliesTo === 'products' ? `На товары: ${item.productIds?.length ?? 0}` : item.appliesTo === 'brands' ? `Бренды: ${(item.brands ?? []).join(', ')}` : item.appliesTo === 'categories' ? `Категории: ${(item.categories ?? []).join(', ')}` : 'Комбинация условий'}</p>
                  {(item.subcategories?.length ?? 0) > 0 && <p>Подкатегории: {item.subcategories.join(', ')}</p>}
                  {item.maxDiscount != null && item.discountType === 'percentage' && <p>Макс. скидка: €{item.maxDiscount}</p>}
                  {item.perUserLimit != null && <p>На клиента: до {item.perUserLimit} раз</p>}
                  {item.firstOrderOnly && <p>Только первый заказ</p>}
                  {item.excludeSaleItems && <p>Без уценённых товаров</p>}
                  {item.maxUses !== null && (
                    <p>Лимит: {item.usedCount}/{item.maxUses} использований</p>
                  )}
                  {item.maxUses === null && item.usedCount > 0 && (
                    <p>Использований: {item.usedCount}</p>
                  )}
                  {item.expiresAt && <p>До: {new Date(item.expiresAt).toLocaleDateString('ru-RU')}</p>}
                </div>

                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button size="sm" variant="outline" onClick={() => openEdit(item)}>Изменить</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggle(item)}
                    className={item.active ? 'text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-900/20' : 'text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/20'}
                  >
                    {item.active ? 'Скрыть' : 'Активировать'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(item.id)}
                    className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20"
                  >
                    Удалить
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
