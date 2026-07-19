'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { logAdminAction } from '@/lib/admin-log-store'

type PromoCodeItem = {
  id: string
  code: string
  discount: number
  minOrder: number
  maxUses: number | null
  usedCount: number
  expiresAt: string | null
  active: boolean
  description: string
}

const emptyForm = (): Omit<PromoCodeItem, 'id'> => ({
  code: '',
  discount: 10,
  minOrder: 0,
  maxUses: null,
  usedCount: 0,
  expiresAt: null,
  active: true,
  description: ''
})

export default function AdminDiscountsPage() {
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

  useEffect(() => { load() }, [])

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
      minOrder: item.minOrder,
      maxUses: item.maxUses,
      usedCount: item.usedCount,
      expiresAt: item.expiresAt,
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
    if (!confirm('Удалить промокод?')) return
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
              <label className="space-y-1">
                <span className="text-sm text-muted-foreground">Код *</span>
                <Input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="WELCOME10"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-muted-foreground">Скидка, %</span>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.discount}
                  onChange={(e) => setForm((f) => ({ ...f, discount: Number(e.target.value) }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-muted-foreground">Мин. сумма заказа, €</span>
                <Input
                  type="number"
                  min={0}
                  value={form.minOrder}
                  onChange={(e) => setForm((f) => ({ ...f, minOrder: Number(e.target.value) }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-muted-foreground">Макс. использований (пусто = без лимита)</span>
                <Input
                  type="number"
                  min={1}
                  value={form.maxUses ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value === '' ? null : Number(e.target.value) }))}
                  placeholder="Без лимита"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-muted-foreground">Действует до</span>
                <Input
                  type="date"
                  value={form.expiresAt ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value || null }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-muted-foreground">Статус</span>
                <Select value={form.active ? 'true' : 'false'} onValueChange={(v) => setForm((f) => ({ ...f, active: v === 'true' }))}>
                  <SelectTrigger className={selectCls}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Активен</SelectItem>
                    <SelectItem value="false">Скрыт</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-sm text-muted-foreground">Описание</span>
                <Input
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
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Нажмите «+ Добавить промокод», чтобы создать первый.</p>
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
