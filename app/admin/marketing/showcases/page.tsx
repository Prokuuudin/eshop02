'use client'
import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Showcase = {
  id: string
  name: string
  description: string
  slug: string
  productIds: string[]
  active: boolean
  order: number
  createdAt: string
  updatedAt: string
}

type Product = {
  id: string
  title: string
  category?: string
  brand?: string
  price?: number
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

const emptyForm = (): Omit<Showcase, 'id' | 'order' | 'createdAt' | 'updatedAt'> => ({
  name: '',
  description: '',
  slug: '',
  productIds: [],
  active: true
})

export default function AdminShowcasesPage() {
  const [items, setItems] = useState<Showcase[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [productSearch, setProductSearch] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [showcasesRes, productsRes] = await Promise.all([
        fetch('/api/admin/showcases'),
        fetch('/api/admin/products')
      ])
      const showcasesData = await showcasesRes.json()
      const productsData = await productsRes.json()
      setItems(Array.isArray(showcasesData) ? showcasesData : [])
      const products = productsData?.data?.products ?? productsData?.products ?? []
      setAllProducts(Array.isArray(products) ? products : [])
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
    setProductSearch('')
    setShowForm(true)
  }

  function openEdit(item: Showcase) {
    setEditId(item.id)
    setForm({
      name: item.name,
      description: item.description,
      slug: item.slug,
      productIds: [...item.productIds],
      active: item.active
    })
    setProductSearch('')
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditId(null)
    setForm(emptyForm())
    setProductSearch('')
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editId) {
        await fetch(`/api/admin/showcases/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })
      } else {
        await fetch('/api/admin/showcases', {
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
    if (!confirm('Удалить подборку?')) return
    await fetch(`/api/admin/showcases/${id}`, { method: 'DELETE' })
    await load()
  }

  async function handleToggle(item: Showcase) {
    await fetch(`/api/admin/showcases/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active })
    })
    await load()
  }

  function addProduct(productId: string) {
    if (form.productIds.includes(productId)) return
    setForm((f) => ({ ...f, productIds: [...f.productIds, productId] }))
  }

  function removeProduct(productId: string) {
    setForm((f) => ({ ...f, productIds: f.productIds.filter((id) => id !== productId) }))
  }

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return []
    const q = productSearch.toLowerCase()
    return allProducts.filter(
      (p) =>
        !form.productIds.includes(p.id) &&
        (p.title?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q))
    ).slice(0, 20)
  }, [productSearch, allProducts, form.productIds])

  const selectedProducts = useMemo(
    () => allProducts.filter((p) => form.productIds.includes(p.id)),
    [allProducts, form.productIds]
  )

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
            <h1 className="text-2xl font-bold text-foreground">Подборки и витрины</h1>
          </div>
          {!showForm && (
            <Button onClick={openCreate}>+ Создать подборку</Button>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <h2 className="text-lg font-semibold text-foreground">
              {editId ? 'Редактировать подборку' : 'Новая подборка'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-sm text-muted-foreground">Название *</span>
                <Input
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value
                    setForm((f) => ({ ...f, name, slug: f.slug === slugify(f.name) || f.slug === '' ? slugify(name) : f.slug }))
                  }}
                  placeholder="Хиты продаж"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-muted-foreground">Slug (URL)</span>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="hits-of-sales"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-sm text-muted-foreground">Описание</span>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Короткое описание подборки"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-muted-foreground">Видимость</span>
                <Select value={form.active ? 'true' : 'false'} onValueChange={(v) => setForm((f) => ({ ...f, active: v === 'true' }))}>
                  <SelectTrigger className={selectCls}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Активна</SelectItem>
                    <SelectItem value="false">Скрыта</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>

            {/* Products section */}
            <div className="space-y-3">
              <h3 className="font-medium text-foreground text-sm">Товары в подборке</h3>

              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Поиск по названию, бренду, категории..."
              />

              {productSearch.trim() && (
                <div className="rounded-md border border-border divide-y divide-gray-100 dark:divide-gray-800 max-h-48 overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Ничего не найдено</p>
                  ) : (
                    filteredProducts.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <div>
                          <span className="text-sm text-foreground">{p.title}</span>
                          {p.brand && <span className="text-xs text-gray-400 ml-2">{p.brand}</span>}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => addProduct(p.id)} className="shrink-0 ml-2">
                          + Добавить
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {selectedProducts.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Добавлено: {selectedProducts.length}</p>
                  <div className="rounded-md border border-border divide-y divide-gray-100 dark:divide-gray-800 max-h-48 overflow-y-auto">
                    {selectedProducts.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2">
                        <div>
                          <span className="text-sm text-foreground">{p.title}</span>
                          {p.brand && <span className="text-xs text-gray-400 ml-2">{p.brand}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeProduct(p.id)}
                          className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 ml-2 shrink-0"
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
          <p className="text-muted-foreground text-sm">Загрузка...</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground text-sm">Подборок пока нет.</p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Нажмите «+ Создать подборку», чтобы начать.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.sort((a, b) => a.order - b.order).map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border bg-card p-5 ${item.active ? 'border-border' : 'border-gray-100 dark:border-gray-800'}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className={`font-semibold ${item.active ? 'text-foreground' : 'text-gray-400 dark:text-gray-500'}`}>
                        {item.name}
                      </h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                        {item.active ? 'Активна' : 'Скрыта'}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    )}
                    <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500 mt-1">
                      <span>/{item.slug}</span>
                      <span>{item.productIds.length} товаров</span>
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
                      {item.active ? 'Скрыть' : 'Показать'}
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
            ))}
          </div>
        )}
      </main>
    </AdminGate>
  )
}
