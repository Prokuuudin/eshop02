'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { logAdminAction } from '@/lib/admin-log-store'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'

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
  appliesTo: 'all' | 'products' | 'brands' | 'categories'
  productIds: string[]
  brands: string[]
  categories: string[]
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
  startsAt: null, perUserLimit: null, appliesTo: 'all', productIds: [], brands: [], categories: [],
  excludedProductIds: [], excludeSaleItems: false, firstOrderOnly: false,
  active: true,
  description: ''
})

export default function AdminDiscountsPage(): React.ReactElement {
  const confirmAction = useAdminConfirm()
  const [items, setItems] = useState<PromoCodeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<PromoCodeItem, 'id'>>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/promo-codes')
      const data = await res.json()
      setItems(Array.isArray(data) ? data : [])
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
      productIds: item.productIds ?? [], brands: item.brands ?? [], categories: item.categories ?? [],
      excludedProductIds: item.excludedProductIds ?? [], excludeSaleItems: item.excludeSaleItems ?? false,
      firstOrderOnly: item.firstOrderOnly ?? false,
      active: item.active,
      description: item.description
    })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditId(null)
    setForm(emptyForm())
  }

  async function handleSave() {
    if (!form.code.trim()) return
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

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Link href="/admin" className="text-sm text-primary hover:underline mb-1 inline-block">
              ← Назад в админку
            </Link>
            <h1 className="text-2xl font-bold text-foreground">Скидки и купоны</h1>
          </div>
          {!showForm && (
            <Button onClick={openCreate}>+ Добавить промокод</Button>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              {editId ? 'Редактировать промокод' : 'Новый промокод'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label htmlFor="admin-discount-field-1" className="space-y-1">
                <span className="text-sm text-muted-foreground">Код *</span>
                <Input id="admin-discount-field-1"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="WELCOME10"
                />
              </label>
              <label htmlFor="admin-discount-field-2" className="space-y-1">
                <span className="text-sm text-muted-foreground">Скидка, %</span>
                <Input id="admin-discount-field-2"
                  type="number"
                  min={1}
                  max={100}
                  value={form.discountValue ?? form.discount}
                  onChange={(e) => setForm((f) => ({ ...f, discountValue: Number(e.target.value), discount: Number(e.target.value) }))}
                />
              </label>
              <label htmlFor="admin-discount-field-3" className="space-y-1">
                <span className="text-sm text-muted-foreground">Мин. сумма заказа, €</span>
                <Input id="admin-discount-field-3"
                  type="number"
                  min={0}
                  value={form.minOrder}
                  onChange={(e) => setForm((f) => ({ ...f, minOrder: Number(e.target.value) }))}
                />
              </label>
              <label htmlFor="admin-discount-field-4" className="space-y-1">
                <span className="text-sm text-muted-foreground">Макс. использований (пусто = без лимита)</span>
                <Input id="admin-discount-field-4"
                  type="number"
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
                  value={form.expiresAt ?? ''}
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
              {form.discountType === 'percentage' && <label className="space-y-1"><span className="text-sm text-muted-foreground">Максимальная скидка, €</span><Input type="number" min={0} value={form.maxDiscount ?? ''} onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value ? Number(e.target.value) : null }))} /></label>}
              <label className="space-y-1"><span className="text-sm text-muted-foreground">Мин. сумма подходящих товаров, €</span><Input type="number" min={0} value={form.minEligibleAmount} onChange={(e) => setForm((f) => ({ ...f, minEligibleAmount: Number(e.target.value) }))} /></label>
              <label className="space-y-1"><span className="text-sm text-muted-foreground">Лимит на клиента</span><Input type="number" min={1} value={form.perUserLimit ?? ''} placeholder="Без лимита" onChange={(e) => setForm((f) => ({ ...f, perUserLimit: e.target.value ? Number(e.target.value) : null }))} /></label>
              <label className="space-y-1"><span className="text-sm text-muted-foreground">Начало действия</span><Input type="date" value={form.startsAt?.slice(0, 10) ?? ''} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value || null }))} /></label>
              <label className="space-y-1"><span className="text-sm text-muted-foreground">Область действия</span><Select value={form.appliesTo} onValueChange={(v) => setForm((f) => ({ ...f, appliesTo: v as PromoCodeItem['appliesTo'] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Вся корзина</SelectItem><SelectItem value="products">Отдельные товары</SelectItem><SelectItem value="brands">Бренды</SelectItem><SelectItem value="categories">Категории</SelectItem></SelectContent></Select></label>
              {form.appliesTo === 'products' && <label className="space-y-1 sm:col-span-2"><span className="text-sm text-muted-foreground">ID товаров через запятую</span><Input value={form.productIds.join(', ')} onChange={(e) => setForm((f) => ({ ...f, productIds: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }))} /></label>}
              {form.appliesTo === 'brands' && <label className="space-y-1 sm:col-span-2"><span className="text-sm text-muted-foreground">Бренды через запятую</span><Input value={form.brands.join(', ')} onChange={(e) => setForm((f) => ({ ...f, brands: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }))} /></label>}
              {form.appliesTo === 'categories' && <label className="space-y-1 sm:col-span-2"><span className="text-sm text-muted-foreground">Коды категорий через запятую</span><Input value={form.categories.join(', ')} onChange={(e) => setForm((f) => ({ ...f, categories: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }))} /></label>}
              <label className="space-y-1 sm:col-span-2"><span className="text-sm text-muted-foreground">Исключить товары (ID через запятую)</span><Input value={form.excludedProductIds.join(', ')} onChange={(e) => setForm((f) => ({ ...f, excludedProductIds: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }))} /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.excludeSaleItems} onChange={(e) => setForm((f) => ({ ...f, excludeSaleItems: e.target.checked }))} />Не применять к уценённым товарам</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => setForm((f) => ({ ...f, firstOrderOnly: e.target.checked }))} />Только первый заказ</label>
              <label htmlFor="admin-discount-field-7" className="space-y-1 sm:col-span-2">
                <span className="text-sm text-muted-foreground">Описание</span>
                <Input id="admin-discount-field-7"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Краткое описание"
                />
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving || !form.code.trim()}>
                {saving ? 'Сохранение...' : editId ? 'Сохранить' : 'Создать'}
              </Button>
              <Button variant="outline" onClick={cancelForm}>Отмена</Button>
            </div>
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
                className={`rounded-xl border bg-card p-5 space-y-3 ${item.active ? 'border-border' : 'border-gray-100 dark:border-gray-800 opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xl font-bold text-foreground tracking-wider">{item.code}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'}`}>
                    {item.active ? 'Активен' : 'Скрыт'}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <span className="text-2xl font-bold text-primary">{item.discount}%</span>
                  {item.description && <span className="text-muted-foreground">{item.description}</span>}
                </div>

                <div className="text-xs text-muted-foreground space-y-0.5">
                  {item.minOrder > 0 && <p>Мин. заказ: €{item.minOrder}</p>}
                  {item.maxUses !== null && (
                    <p>Лимит: {item.usedCount}/{item.maxUses} использований</p>
                  )}
                  {item.maxUses === null && item.usedCount > 0 && (
                    <p>Использований: {item.usedCount}</p>
                  )}
                  {item.expiresAt && <p>До: {new Date(item.expiresAt).toLocaleDateString('ru-RU')}</p>}
                </div>

                <div className="flex gap-2 pt-1 flex-wrap">
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
