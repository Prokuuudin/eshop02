'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

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
  minOrderAmount: number
  createdAt: string
  updatedAt: string
}

const CATEGORIES = [
  { value: 'hair', label: 'Волосы' },
  { value: 'face', label: 'Лицо' },
  { value: 'body', label: 'Тело' },
  { value: 'nails', label: 'Ногти' },
  { value: 'equipment', label: 'Оборудование' },
  { value: 'new', label: 'Новинки' }
]

const TYPE_LABELS: Record<CampaignType, string> = {
  discount: 'Скидка',
  gift: 'Подарок',
  bundle: 'Набор',
  free_shipping: 'Бесплатная доставка'
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
  minOrderAmount: 0
})

function getCampaignStatus(campaign: PromoCampaign): { label: string; cls: string } {
  if (!campaign.active) return { label: 'Неактивна', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' }
  const now = new Date()
  const start = new Date(campaign.startDate)
  const end = campaign.endDate ? new Date(campaign.endDate) : null
  if (now < start) return { label: 'Предстоящая', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' }
  if (end && now > end) return { label: 'Завершена', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' }
  return { label: 'Активна', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' }
}

export default function AdminCampaignsPage() {
  const [items, setItems] = useState<PromoCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/campaigns')
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
      targetCategories: item.targetCategories,
      minOrderAmount: item.minOrderAmount
    })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditId(null)
    setForm(emptyForm())
  }

  function toggleCategory(val: string) {
    setForm((f) => ({
      ...f,
      targetCategories: f.targetCategories.includes(val)
        ? f.targetCategories.filter((c) => c !== val)
        : [...f.targetCategories, val]
    }))
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editId) {
        await fetch(`/api/admin/campaigns/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })
      } else {
        await fetch('/api/admin/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })
      }
      await load()
      cancelForm()
    } catch {
      setError('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить кампанию?')) return
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

  const selectCls = 'w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm'

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Link href="/admin" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline mb-1 inline-block">
              ← Назад в админку
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Промо-кампании</h1>
          </div>
          {!showForm && (
            <Button onClick={openCreate}>+ Новая кампания</Button>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {editId ? 'Редактировать кампанию' : 'Новая кампания'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Название *</span>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Весенняя акция"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Описание</span>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Подробное описание кампании"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600 dark:text-gray-400">Тип</span>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CampaignType }))}
                  className={selectCls}
                >
                  <option value="discount">Скидка</option>
                  <option value="gift">Подарок</option>
                  <option value="bundle">Набор</option>
                  <option value="free_shipping">Бесплатная доставка</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600 dark:text-gray-400">Скидка, %</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.discountPercent}
                  onChange={(e) => setForm((f) => ({ ...f, discountPercent: Number(e.target.value) }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600 dark:text-gray-400">Дата начала</span>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600 dark:text-gray-400">Дата окончания</span>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600 dark:text-gray-400">Мин. сумма заказа, €</span>
                <Input
                  type="number"
                  min={0}
                  value={form.minOrderAmount}
                  onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: Number(e.target.value) }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600 dark:text-gray-400">Статус</span>
                <select
                  value={form.active ? 'true' : 'false'}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'true' }))}
                  className={selectCls}
                >
                  <option value="true">Активна</option>
                  <option value="false">Неактивна</option>
                </select>
              </label>
              <div className="space-y-2 sm:col-span-2">
                <span className="text-sm text-gray-600 dark:text-gray-400 block">Категории товаров (пусто = все)</span>
                <div className="flex flex-wrap gap-3">
                  {CATEGORIES.map((cat) => (
                    <label key={cat.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.targetCategories.includes(cat.value)}
                        onChange={() => toggleCategory(cat.value)}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                      <span className="text-gray-700 dark:text-gray-300">{cat.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Сохранение...' : editId ? 'Сохранить' : 'Создать'}
              </Button>
              <Button variant="outline" onClick={cancelForm}>Отмена</Button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">Загрузка...</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">Кампаний пока нет.</p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Нажмите «+ Новая кампания», чтобы создать первую.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const status = getCampaignStatus(item)
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{item.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.cls}`}>
                          {status.label}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 font-medium">
                          {TYPE_LABELS[item.type]}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{item.description}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {item.discountPercent > 0 && <span>Скидка: {item.discountPercent}%</span>}
                        <span>С {new Date(item.startDate).toLocaleDateString('ru-RU')}</span>
                        {item.endDate && <span>по {new Date(item.endDate).toLocaleDateString('ru-RU')}</span>}
                        {item.minOrderAmount > 0 && <span>Мин. заказ: €{item.minOrderAmount}</span>}
                        {item.targetCategories.length > 0 && (
                          <span>Категории: {item.targetCategories.map((c) => CATEGORIES.find((x) => x.value === c)?.label ?? c).join(', ')}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                      <Button size="sm" variant="outline" onClick={() => openEdit(item)}>Изменить</Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggle(item)}
                        className={item.active ? 'text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-900/20' : 'text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/20'}
                      >
                        {item.active ? 'Деактивировать' : 'Активировать'}
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
                </div>
              )
            })}
          </div>
        )}
      </main>
    </AdminGate>
  )
}
