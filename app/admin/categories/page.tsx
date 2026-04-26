'use client'

import React from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CategoriesConfigPayload, CategoryConfigItem, CategoryConfigSubcategory, LocalizedLabel } from '@/lib/categories-config'
import { useTranslation } from '@/lib/use-translation'

type NewCategoryDraft = {
  id: string
  image: string
  ru: string
  en: string
  lv: string
  firstSubSlug: string
  firstSubSearch: string
  firstSubRu: string
  firstSubEn: string
  firstSubLv: string
}

type NewSubDraft = {
  slug: string
  search: string
  ru: string
  en: string
  lv: string
}

const EMPTY_NEW_CATEGORY: NewCategoryDraft = {
  id: '',
  image: '/categories/new.jpg',
  ru: '',
  en: '',
  lv: '',
  firstSubSlug: '',
  firstSubSearch: '',
  firstSubRu: '',
  firstSubEn: '',
  firstSubLv: ''
}

const sanitizeSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

const normalizeLabels = (ru: string, en: string, lv: string, fallback: string): LocalizedLabel => {
  const normalizedRu = ru.trim() || fallback
  const normalizedEn = en.trim() || normalizedRu
  const normalizedLv = lv.trim() || normalizedRu
  return { ru: normalizedRu, en: normalizedEn, lv: normalizedLv }
}

export default function AdminCategoriesPage() {
  const { language, t } = useTranslation()
  const l = (ru: string, en: string, lv: string) => (language === 'ru' ? ru : language === 'lv' ? lv : en)
  const tl = (key: string, ru: string, en: string, lv: string, params?: Record<string, string | number>) => t(key, l(ru, en, lv), params)

  const [categories, setCategories] = React.useState<CategoryConfigItem[]>([])
  const [savedCategories, setSavedCategories] = React.useState<CategoryConfigItem[]>([])
  const [deletedCategories, setDeletedCategories] = React.useState<CategoryConfigItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const [error, setError] = React.useState('')
  const [newCategory, setNewCategory] = React.useState<NewCategoryDraft>(EMPTY_NEW_CATEGORY)
  const [newSubByCategory, setNewSubByCategory] = React.useState<Record<string, NewSubDraft>>({})
  const newCategoryPreviewLabel =
    newCategory.ru.trim()
    || newCategory.en.trim()
    || newCategory.lv.trim()
    || sanitizeSlug(newCategory.id)
    || tl('admin.categories.newCategoryFallback', 'Новая категория', 'New category', 'Jauna kategorija')

  React.useEffect(() => {
    const loadCategories = async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/admin/categories', { cache: 'no-store' })
        if (!response.ok) throw new Error('failed_to_load_categories')
        const payload = (await response.json()) as Partial<CategoriesConfigPayload>
        setCategories(payload.categories ?? [])
        setSavedCategories(payload.categories ?? [])
        setDeletedCategories(payload.deletedCategories ?? [])
        setError('')
      } catch {
        setError(tl('admin.categories.msg.loadFailed', 'Не удалось загрузить категории', 'Failed to load categories', 'Neizdevas ieladet kategorijas'))
      } finally {
        setLoading(false)
      }
    }

    void loadCategories()
  }, [language])

  const saveConfig = async (nextCategories: CategoryConfigItem[], nextDeletedCategories: CategoryConfigItem[], successMessage: string) => {
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/admin/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: nextCategories,
          deletedCategories: nextDeletedCategories
        })
      })
      if (!response.ok) throw new Error('failed_to_save_categories')

      const payload = (await response.json()) as Partial<CategoriesConfigPayload>
      const resolvedCategories = payload.categories ?? nextCategories
      setCategories(resolvedCategories)
      setSavedCategories(resolvedCategories)
      setDeletedCategories(payload.deletedCategories ?? nextDeletedCategories)
      setMessage(successMessage)
    } catch {
      setError(tl('admin.categories.msg.saveFailed', 'Не удалось сохранить изменения', 'Failed to save changes', 'Neizdevas saglabat izmainas'))
    } finally {
      setSaving(false)
    }
  }

  const updateCategoryLabels = (categoryId: string, nextLabels: Partial<LocalizedLabel>) => {
    setCategories((prev) =>
      prev.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              labels: {
                ...category.labels,
                ...nextLabels
              }
            }
          : category
      )
    )
  }

  const updateSubcategoryLabels = (categoryId: string, slug: string, nextLabels: Partial<LocalizedLabel>) => {
    setCategories((prev) =>
      prev.map((category) => {
        if (category.id !== categoryId) return category

        return {
          ...category,
          subcategories: category.subcategories.map((subcategory) =>
            subcategory.slug === slug
              ? {
                  ...subcategory,
                  labels: {
                    ...subcategory.labels,
                    ...nextLabels
                  }
                }
              : subcategory
          )
        }
      })
    )
  }

  const handleCreateCategory = async () => {
    const id = sanitizeSlug(newCategory.id)
    if (!id) {
      setError(tl('admin.categories.msg.idRequired', 'Укажите ID категории', 'Provide category ID', 'Noradiet kategorijas ID'))
      return
    }

    if (categories.some((category) => category.id === id)) {
      setError(tl('admin.categories.msg.idExists', 'Категория с таким ID уже существует', 'Category with this ID already exists', 'Kategorija ar so ID jau pastav'))
      return
    }

    const labels = normalizeLabels(newCategory.ru, newCategory.en, newCategory.lv, id)
    const firstSubSlug = sanitizeSlug(newCategory.firstSubSlug)
    const subcategories: CategoryConfigSubcategory[] = firstSubSlug
      ? [
          {
            slug: firstSubSlug,
            labels: normalizeLabels(newCategory.firstSubRu, newCategory.firstSubEn, newCategory.firstSubLv, firstSubSlug),
            search: newCategory.firstSubSearch.trim()
          }
        ]
      : []

    const next: CategoryConfigItem[] = [
      ...categories,
      {
        id,
        href: `/catalog?cat=${id}`,
        image: newCategory.image.trim() || '/categories/new.jpg',
        labels,
        subcategories
      }
    ]

    await saveConfig(next, deletedCategories, tl('admin.categories.msg.created', 'Категория создана', 'Category created', 'Kategorija izveidota'))
    setNewCategory(EMPTY_NEW_CATEGORY)
  }

  const handleAddSubcategory = async (categoryId: string) => {
    const draft = newSubByCategory[categoryId]
    const slug = sanitizeSlug(draft?.slug ?? '')

    if (!slug) {
      setError(tl('admin.categories.msg.subSlugRequired', 'Укажите slug подпункта', 'Provide subcategory slug', 'Noradiet apakskategorijas slug'))
      return
    }

    const category = categories.find((item) => item.id === categoryId)
    if (!category) return

    if (category.subcategories.some((subcategory) => subcategory.slug === slug)) {
      setError(tl('admin.categories.msg.subSlugExists', 'Подпункт с таким slug уже есть', 'Subcategory slug already exists', 'Apakskategorijas slug jau pastav'))
      return
    }

    const next = categories.map((item) => {
      if (item.id !== categoryId) return item

      return {
        ...item,
        subcategories: [
          ...item.subcategories,
          {
            slug,
            labels: normalizeLabels(draft?.ru ?? '', draft?.en ?? '', draft?.lv ?? '', slug),
            search: draft?.search?.trim() ?? ''
          }
        ]
      }
    })

    await saveConfig(next, deletedCategories, tl('admin.categories.msg.subAdded', 'Подпункт добавлен', 'Subcategory added', 'Apakskategorija pievienota'))
    setNewSubByCategory((prev) => ({
      ...prev,
      [categoryId]: { slug: '', search: '', ru: '', en: '', lv: '' }
    }))
  }

  const handleRemoveSubcategory = async (categoryId: string, slug: string) => {
    const next = categories.map((item) => {
      if (item.id !== categoryId) return item
      return {
        ...item,
        subcategories: item.subcategories.filter((subcategory) => subcategory.slug !== slug)
      }
    })

    await saveConfig(next, deletedCategories, tl('admin.categories.msg.subRemoved', 'Подпункт удален', 'Subcategory removed', 'Apakskategorija dzesta'))
  }

  const handleSaveCategory = async () => {
    await saveConfig(categories, deletedCategories, tl('admin.categories.msg.saved', 'Изменения категории сохранены', 'Category changes saved', 'Kategorijas izmainas saglabatas'))
  }

  const handleResetCategoryChanges = (categoryId: string) => {
    const savedCategory = savedCategories.find((item) => item.id === categoryId)
    if (!savedCategory) {
      setError(tl('admin.categories.msg.savedVersionMissing', 'Не удалось найти сохраненную версию категории', 'Saved category version not found', 'Saglabata kategorijas versija nav atrasta'))
      return
    }

    setCategories((prev) => prev.map((item) => (item.id === categoryId ? savedCategory : item)))
    setNewSubByCategory((prev) => {
      if (!prev[categoryId]) return prev
      const next = { ...prev }
      delete next[categoryId]
      return next
    })
    setError('')
    setMessage(tl('admin.categories.msg.cardReset', 'Изменения карточки сброшены', 'Card changes were reset', 'Kartites izmainas atiestatitas'))
  }

  const handleMoveCategoryToTrash = async (categoryId: string) => {
    const category = categories.find((item) => item.id === categoryId)
    if (!category) return

    const confirmed = window.confirm(
      tl(
        'admin.categories.confirm.moveToTrash',
        'Переместить категорию {id} в корзину?',
        'Move category {id} to trash?',
        'Parvietot kategoriju {id} uz grozu?',
        { id: categoryId }
      )
    )
    if (!confirmed) return

    const nextCategories = categories.filter((item) => item.id !== categoryId)
    const nextDeletedCategories = [
      ...deletedCategories.filter((item) => item.id !== categoryId),
      category
    ]

    await saveConfig(nextCategories, nextDeletedCategories, tl('admin.categories.msg.movedToTrash', 'Категория перемещена в корзину', 'Category moved to trash', 'Kategorija parvietota uz grozu'))
  }

  const handleRestoreCategory = async (categoryId: string) => {
    const category = deletedCategories.find((item) => item.id === categoryId)
    if (!category) return

    if (categories.some((item) => item.id === categoryId)) {
      setError(tl('admin.categories.msg.idExistsActive', 'Категория с таким ID уже существует среди активных', 'Category with this ID already exists among active items', 'Kategorija ar so ID jau ir aktivajas'))
      return
    }

    const nextCategories = [...categories, category]
    const nextDeletedCategories = deletedCategories.filter((item) => item.id !== categoryId)

    await saveConfig(nextCategories, nextDeletedCategories, tl('admin.categories.msg.restored', 'Категория восстановлена', 'Category restored', 'Kategorija atjaunota'))
  }

  const handleDeleteCategoryForever = async (categoryId: string) => {
    const confirmed = window.confirm(
      tl(
        'admin.categories.confirm.deleteForever',
        'Удалить категорию {id} из корзины навсегда?',
        'Delete category {id} from trash permanently?',
        'Neatgriezeniski dzest kategoriju {id} no groza?',
        { id: categoryId }
      )
    )
    if (!confirmed) return

    const nextDeletedCategories = deletedCategories.filter((item) => item.id !== categoryId)
    await saveConfig(categories, nextDeletedCategories, tl('admin.categories.msg.deletedFromTrash', 'Категория удалена из корзины', 'Category removed from trash', 'Kategorija dzesta no groza'))
  }

  return (
    <AdminGate>
      <main className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {tl('admin.categories.title', 'Категории: управление структурой', 'Categories: structure management', 'Kategorijas: strukturas parvaldiba')}
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {tl(
                  'admin.categories.subtitle',
                  'Создавайте новые категории, добавляйте и удаляйте подпункты, редактируйте названия на RU/EN/LV.',
                  'Create categories, add/remove subcategories, edit labels in RU/EN/LV.',
                  'Izveidojiet kategorijas, pievienojiet/dzesiet apakskategorijas, redigejiet nosaukumus RU/EN/LV.'
                )}
              </p>
            </div>
            <Link href="/admin">
              <Button variant="outline">{tl('admin.categories.backToAdmin', 'Назад в админку', 'Back to admin', 'Atpakal uz admin')}</Button>
            </Link>
          </div>
        </div>

        {message && (
          <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-200">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </p>
        )}

        <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {tl('admin.categories.createTitle', 'Создать новую категорию', 'Create new category', 'Izveidot jaunu kategoriju')}
          </h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="grid gap-2 md:grid-cols-3">
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">ID (slug)</span>
                <Input
                  value={newCategory.id}
                  placeholder={tl('admin.categories.placeholder.id', 'Например: hair-care', 'Example: hair-care', 'Piemers: hair-care')}
                  onChange={(event) => setNewCategory((prev) => ({ ...prev, id: event.target.value }))}
                />
              </label>
              <label className="text-xs md:col-span-2">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">Image</span>
                <Input
                  value={newCategory.image}
                  placeholder={tl('admin.categories.placeholder.image', '/categories/hair-care.jpg', '/categories/hair-care.jpg', '/categories/hair-care.jpg')}
                  onChange={(event) => setNewCategory((prev) => ({ ...prev, image: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">Name RU</span>
                <Input
                  value={newCategory.ru}
                  placeholder={tl('admin.categories.placeholder.nameRu', 'Уход за волосами', 'Hair care', 'Matu kopsana')}
                  onChange={(event) => setNewCategory((prev) => ({ ...prev, ru: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">Name EN</span>
                <Input
                  value={newCategory.en}
                  placeholder={tl('admin.categories.placeholder.nameEn', 'Hair care', 'Hair care', 'Hair care')}
                  onChange={(event) => setNewCategory((prev) => ({ ...prev, en: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">Name LV</span>
                <Input
                  value={newCategory.lv}
                  placeholder={tl('admin.categories.placeholder.nameLv', 'Matu kopsana', 'Hair care', 'Matu kopsana')}
                  onChange={(event) => setNewCategory((prev) => ({ ...prev, lv: event.target.value }))}
                />
              </label>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/40">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {tl('admin.categories.previewCard', 'Превью карточки', 'Card preview', 'Kartites priekskats')}
              </p>
              <div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                <img
                  src={newCategory.image.trim() || '/categories/new.jpg'}
                  alt={newCategoryPreviewLabel}
                  className="h-36 w-full object-cover"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.onerror = null
                    event.currentTarget.src = '/categories/new.jpg'
                  }}
                />
                <div className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">{newCategoryPreviewLabel}</div>
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
              {tl('admin.categories.firstSubOptional', 'Первый подпункт (опционально)', 'First subcategory (optional)', 'Pirma apakskategorija (neobligata)')}
            </p>
            <div className="mt-2 grid gap-2 md:grid-cols-5">
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">Slug</span>
                <Input
                  value={newCategory.firstSubSlug}
                  placeholder={tl('admin.categories.placeholder.firstSubSlug', 'Например: shampoo', 'Example: shampoo', 'Piemers: shampoo')}
                  onChange={(event) => setNewCategory((prev) => ({ ...prev, firstSubSlug: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">Search token</span>
                <Input
                  value={newCategory.firstSubSearch}
                  placeholder={tl('admin.categories.placeholder.firstSubSearch', 'Например: шампунь', 'Example: shampoo', 'Piemers: sampuns')}
                  onChange={(event) => setNewCategory((prev) => ({ ...prev, firstSubSearch: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">RU</span>
                <Input
                  value={newCategory.firstSubRu}
                  placeholder={tl('admin.categories.placeholder.firstSubRu', 'Шампуни', 'Shampoos', 'Sampuni')}
                  onChange={(event) => setNewCategory((prev) => ({ ...prev, firstSubRu: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">EN</span>
                <Input
                  value={newCategory.firstSubEn}
                  placeholder={tl('admin.categories.placeholder.firstSubEn', 'Shampoos', 'Shampoos', 'Shampoos')}
                  onChange={(event) => setNewCategory((prev) => ({ ...prev, firstSubEn: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">LV</span>
                <Input
                  value={newCategory.firstSubLv}
                  placeholder={tl('admin.categories.placeholder.firstSubLv', 'Sampuni', 'Shampoos', 'Sampuni')}
                  onChange={(event) => setNewCategory((prev) => ({ ...prev, firstSubLv: event.target.value }))}
                />
              </label>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <Button onClick={() => void handleCreateCategory()} disabled={saving}>
              {saving
                ? tl('admin.categories.saving', 'Сохранение...', 'Saving...', 'Saglabasana...')
                : tl('admin.categories.createButton', 'Создать категорию', 'Create category', 'Izveidot kategoriju')}
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {tl('admin.categories.existingCatalog', 'Существующие категории каталога', 'Existing catalog categories', 'Esošās kataloga kategorijas')}
          </h2>
          {loading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {tl('admin.categories.loading', 'Загрузка категорий...', 'Loading categories...', 'Ieladejam kategorijas...')}
            </div>
          ) : (
            categories.map((category) => (
              <article key={category.id} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{category.labels[language] || category.id}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{category.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => void handleSaveCategory()} disabled={saving}>
                      {saving
                        ? tl('admin.categories.saving', 'Сохранение...', 'Saving...', 'Saglabasana...')
                        : tl('admin.categories.saveButton', 'Сохранить', 'Save', 'Saglabat')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleResetCategoryChanges(category.id)} disabled={saving}>
                      {tl('admin.categories.resetButton', 'Сбросить', 'Reset', 'Atiestatit')}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => void handleMoveCategoryToTrash(category.id)} disabled={saving}>
                      {tl('admin.categories.moveToTrashButton', 'В корзину', 'Move to trash', 'Uz grozu')}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="grid gap-2 md:grid-cols-4">
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">RU</span>
                      <Input
                        value={category.labels.ru}
                        onChange={(event) => updateCategoryLabels(category.id, { ru: event.target.value })}
                      />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">EN</span>
                      <Input
                        value={category.labels.en}
                        onChange={(event) => updateCategoryLabels(category.id, { en: event.target.value })}
                      />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">LV</span>
                      <Input
                        value={category.labels.lv}
                        onChange={(event) => updateCategoryLabels(category.id, { lv: event.target.value })}
                      />
                    </label>
                    <label className="text-xs md:col-span-4">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">Image</span>
                      <Input
                        value={category.image}
                        onChange={(event) =>
                          setCategories((prev) =>
                            prev.map((item) => (item.id === category.id ? { ...item, image: event.target.value } : item))
                          )
                        }
                      />
                    </label>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/40">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {tl('admin.categories.previewCard', 'Превью карточки', 'Card preview', 'Kartites priekskats')}
                    </p>
                    <div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                      <img
                        src={category.image.trim() || '/categories/new.jpg'}
                        alt={category.labels[language] || category.id}
                        className="h-36 w-full object-cover"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.onerror = null
                          event.currentTarget.src = '/categories/new.jpg'
                        }}
                      />
                      <div className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">{category.labels[language] || category.id}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                    {tl('admin.categories.subcategories', 'Подпункты', 'Subcategories', 'Apakskategorijas')} ({category.subcategories.length})
                  </p>

                  <div className="mt-2 space-y-2">
                    {category.subcategories.map((subcategory) => (
                      <div key={`${category.id}-${subcategory.slug}`} className="rounded border border-gray-200 p-2 dark:border-gray-700">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{subcategory.slug}</span>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void handleRemoveSubcategory(category.id, subcategory.slug)}
                            disabled={saving}
                          >
                            {tl('admin.categories.deleteButton', 'Удалить', 'Delete', 'Dzest')}
                          </Button>
                        </div>
                        <div className="grid gap-2 md:grid-cols-4">
                          <label className="text-xs">
                            <span className="mb-1 block text-gray-600 dark:text-gray-300">RU</span>
                            <Input
                              value={subcategory.labels.ru}
                              onChange={(event) => updateSubcategoryLabels(category.id, subcategory.slug, { ru: event.target.value })}
                            />
                          </label>
                          <label className="text-xs">
                            <span className="mb-1 block text-gray-600 dark:text-gray-300">EN</span>
                            <Input
                              value={subcategory.labels.en}
                              onChange={(event) => updateSubcategoryLabels(category.id, subcategory.slug, { en: event.target.value })}
                            />
                          </label>
                          <label className="text-xs">
                            <span className="mb-1 block text-gray-600 dark:text-gray-300">LV</span>
                            <Input
                              value={subcategory.labels.lv}
                              onChange={(event) => updateSubcategoryLabels(category.id, subcategory.slug, { lv: event.target.value })}
                            />
                          </label>
                          <label className="text-xs">
                            <span className="mb-1 block text-gray-600 dark:text-gray-300">Search token</span>
                            <Input
                              value={subcategory.search}
                              onChange={(event) =>
                                setCategories((prev) =>
                                  prev.map((item) => {
                                    if (item.id !== category.id) return item
                                    return {
                                      ...item,
                                      subcategories: item.subcategories.map((sub) =>
                                        sub.slug === subcategory.slug ? { ...sub, search: event.target.value } : sub
                                      )
                                    }
                                  })
                                )
                              }
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-5">
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">New slug</span>
                      <Input
                        value={newSubByCategory[category.id]?.slug ?? ''}
                        onChange={(event) =>
                          setNewSubByCategory((prev) => ({
                            ...prev,
                            [category.id]: {
                              slug: event.target.value,
                              search: prev[category.id]?.search ?? '',
                              ru: prev[category.id]?.ru ?? '',
                              en: prev[category.id]?.en ?? '',
                              lv: prev[category.id]?.lv ?? ''
                            }
                          }))
                        }
                      />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">Search token</span>
                      <Input
                        value={newSubByCategory[category.id]?.search ?? ''}
                        onChange={(event) =>
                          setNewSubByCategory((prev) => ({
                            ...prev,
                            [category.id]: {
                              slug: prev[category.id]?.slug ?? '',
                              search: event.target.value,
                              ru: prev[category.id]?.ru ?? '',
                              en: prev[category.id]?.en ?? '',
                              lv: prev[category.id]?.lv ?? ''
                            }
                          }))
                        }
                      />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">RU</span>
                      <Input
                        value={newSubByCategory[category.id]?.ru ?? ''}
                        onChange={(event) =>
                          setNewSubByCategory((prev) => ({
                            ...prev,
                            [category.id]: {
                              slug: prev[category.id]?.slug ?? '',
                              search: prev[category.id]?.search ?? '',
                              ru: event.target.value,
                              en: prev[category.id]?.en ?? '',
                              lv: prev[category.id]?.lv ?? ''
                            }
                          }))
                        }
                      />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">EN</span>
                      <Input
                        value={newSubByCategory[category.id]?.en ?? ''}
                        onChange={(event) =>
                          setNewSubByCategory((prev) => ({
                            ...prev,
                            [category.id]: {
                              slug: prev[category.id]?.slug ?? '',
                              search: prev[category.id]?.search ?? '',
                              ru: prev[category.id]?.ru ?? '',
                              en: event.target.value,
                              lv: prev[category.id]?.lv ?? ''
                            }
                          }))
                        }
                      />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">LV</span>
                      <Input
                        value={newSubByCategory[category.id]?.lv ?? ''}
                        onChange={(event) =>
                          setNewSubByCategory((prev) => ({
                            ...prev,
                            [category.id]: {
                              slug: prev[category.id]?.slug ?? '',
                              search: prev[category.id]?.search ?? '',
                              ru: prev[category.id]?.ru ?? '',
                              en: prev[category.id]?.en ?? '',
                              lv: event.target.value
                            }
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Button size="sm" onClick={() => void handleAddSubcategory(category.id)} disabled={saving}>
                      {saving
                        ? tl('admin.categories.saving', 'Сохранение...', 'Saving...', 'Saglabasana...')
                        : tl('admin.categories.addSubButton', 'Добавить подпункт', 'Add subcategory', 'Pievienot apakskategoriju')}
                    </Button>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {tl('admin.categories.trashTitle', 'Корзина категорий', 'Categories trash', 'Kategoriju grozs')} ({deletedCategories.length})
          </h2>

          {deletedCategories.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{tl('admin.categories.trashEmpty', 'Корзина пуста', 'Trash is empty', 'Grozs ir tukss')}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {deletedCategories.map((category) => (
                <div key={`trash-${category.id}`} className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">{category.id}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-100">{category.labels[language] || category.id}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{tl('admin.categories.subcategoriesCount', 'Подпунктов', 'Subcategories', 'Apakskategorijas')}: {category.subcategories.length}</span>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void handleRestoreCategory(category.id)} disabled={saving}>
                      {tl('admin.categories.restoreButton', 'Восстановить', 'Restore', 'Atjaunot')}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => void handleDeleteCategoryForever(category.id)} disabled={saving}>
                      {tl('admin.categories.deleteForeverButton', 'Удалить навсегда', 'Delete forever', 'Dzest neatgriezeniski')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </AdminGate>
  )
}
