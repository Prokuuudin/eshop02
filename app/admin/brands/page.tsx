'use client'

import React from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BrandConfigItem, BrandsConfigPayload, LocalizedBrandDescription } from '@/lib/brands-config'
import { useTranslation } from '@/lib/use-translation'

type NewBrandDraft = {
  id: string
  name: string
  logo: string
  popular: boolean
  descriptionRu: string
  descriptionEn: string
  descriptionLv: string
}

const EMPTY_NEW_BRAND: NewBrandDraft = {
  id: '',
  name: '',
  logo: '/brands/new-brand.svg',
  popular: false,
  descriptionRu: '',
  descriptionEn: '',
  descriptionLv: ''
}

const sanitizeSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

const normalizeDescription = (ru: string, en: string, lv: string): LocalizedBrandDescription => {
  const normalizedRu = ru.trim()
  const normalizedEn = en.trim() || normalizedRu
  const normalizedLv = lv.trim() || normalizedRu
  return { ru: normalizedRu, en: normalizedEn, lv: normalizedLv }
}

export default function AdminBrandsPage() {
  const { t, language } = useTranslation()
  const l = (ru: string, en: string, lv: string) => (language === 'ru' ? ru : language === 'lv' ? lv : en)
  const tl = (key: string, ru: string, en: string, lv: string, params?: Record<string, string | number>) => t(key, l(ru, en, lv), params)

  const [brands, setBrands] = React.useState<BrandConfigItem[]>([])
  const [savedBrands, setSavedBrands] = React.useState<BrandConfigItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const [error, setError] = React.useState('')
  const [newBrand, setNewBrand] = React.useState<NewBrandDraft>(EMPTY_NEW_BRAND)

  React.useEffect(() => {
    const loadBrands = async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/admin/brands', { cache: 'no-store' })
        if (!response.ok) throw new Error('failed_to_load_brands')
        const payload = (await response.json()) as Partial<BrandsConfigPayload>
        const nextBrands = payload.brands ?? []
        setBrands(nextBrands)
        setSavedBrands(nextBrands)
        setError('')
      } catch {
        setError(tl('admin.brands.msg.loadFailed', 'Не удалось загрузить бренды', 'Failed to load brands', 'Neizdevas ieladet zimolus'))
      } finally {
        setLoading(false)
      }
    }

    void loadBrands()
  }, [language])

  const saveBrands = async (nextBrands: BrandConfigItem[], successMessage: string) => {
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/admin/brands', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brands: nextBrands })
      })
      if (!response.ok) throw new Error('failed_to_save_brands')

      const payload = (await response.json()) as Partial<BrandsConfigPayload>
      const resolved = payload.brands ?? nextBrands
      setBrands(resolved)
      setSavedBrands(resolved)
      setMessage(successMessage)
    } catch {
      setError(tl('admin.brands.msg.saveFailed', 'Не удалось сохранить изменения', 'Failed to save changes', 'Neizdevas saglabat izmainas'))
    } finally {
      setSaving(false)
    }
  }

  const updateBrand = (brandId: string, patch: Partial<BrandConfigItem>) => {
    setBrands((prev) => prev.map((brand) => (brand.id === brandId ? { ...brand, ...patch } : brand)))
  }

  const updateBrandDescription = (brandId: string, patch: Partial<LocalizedBrandDescription>) => {
    setBrands((prev) =>
      prev.map((brand) =>
        brand.id === brandId
          ? {
              ...brand,
              description: {
                ...brand.description,
                ...patch
              }
            }
          : brand
      )
    )
  }

  const handleCreateBrand = async () => {
    const id = sanitizeSlug(newBrand.id)
    const name = newBrand.name.trim()
    const logo = newBrand.logo.trim()

    if (!id || !name || !logo) {
      setError(tl('admin.brands.msg.fillRequired', 'Заполните ID, название и логотип', 'Fill in ID, name, and logo', 'Aizpildiet ID, nosaukumu un logo'))
      return
    }

    if (brands.some((brand) => brand.id === id)) {
      setError(tl('admin.brands.msg.duplicateId', 'Бренд с таким ID уже существует', 'Brand with this ID already exists', 'Zimols ar so ID jau pastav'))
      return
    }

    const next: BrandConfigItem[] = [
      ...brands,
      {
        id,
        name,
        logo,
        popular: newBrand.popular,
        description: normalizeDescription(newBrand.descriptionRu, newBrand.descriptionEn, newBrand.descriptionLv)
      }
    ]

    await saveBrands(next, tl('admin.brands.msg.added', 'Бренд добавлен', 'Brand added', 'Zimols pievienots'))
    setNewBrand(EMPTY_NEW_BRAND)
  }

  const handleSaveBrand = async () => {
    await saveBrands(brands, tl('admin.brands.msg.changesSaved', 'Изменения брендов сохранены', 'Brand changes saved', 'Zimolu izmainas saglabatas'))
  }

  const handleResetBrand = (brandId: string) => {
    const saved = savedBrands.find((brand) => brand.id === brandId)
    if (!saved) {
      setError(tl('admin.brands.msg.savedVersionNotFound', 'Не найдена сохраненная версия бренда', 'Saved brand version not found', 'Saglabata zimola versija nav atrasta'))
      return
    }

    setBrands((prev) => prev.map((brand) => (brand.id === brandId ? saved : brand)))
    setMessage(tl('admin.brands.msg.cardReset', 'Изменения карточки бренда сброшены', 'Brand card changes reset', 'Zimola kartites izmainas atiestatitas'))
    setError('')
  }

  const handleDeleteBrand = async (brandId: string) => {
    const confirmed = window.confirm(
      tl('admin.brands.msg.deleteConfirmWithId', 'Удалить бренд {id}?', 'Delete brand {id}?', 'Dzest zimolu {id}?', { id: brandId })
    )
    if (!confirmed) return

    const next = brands.filter((brand) => brand.id !== brandId)
    await saveBrands(next, tl('admin.brands.msg.deleted', 'Бренд удален', 'Brand deleted', 'Zimols dzests'))
  }

  const newBrandTitle =
    newBrand.name.trim() ||
    sanitizeSlug(newBrand.id) ||
    tl('admin.brands.newBrandDefault', 'Новый бренд', 'New brand', 'Jauns zimols')

  return (
    <AdminGate>
      <main className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {tl('admin.brands.title', 'Бренды: управление', 'Brands: management', 'Zimoli: parvaldiba')}
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {tl(
                  'admin.brands.subtitle',
                  'Создавайте новые бренды и редактируйте существующие карточки брендов.',
                  'Create new brands and edit existing brand cards.',
                  'Izveidojiet jaunus zimolus un redigejiet esasas zimolu kartites.'
                )}
              </p>
            </div>
            <Link href="/admin">
              <Button variant="outline">{tl('admin.brands.backToAdmin', 'Назад в админку', 'Back to admin', 'Atpakal uz admin')}</Button>
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

        <section className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-800 dark:bg-indigo-950/20">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {tl('admin.brands.newBrand', 'Новый бренд', 'New brand', 'Jauns zimols')}
          </h2>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="grid gap-2 md:grid-cols-3">
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.brands.field.idSlug', 'ID (slug)', 'ID (slug)', 'ID (slug)')}</span>
                <Input
                  value={newBrand.id}
                  placeholder={tl('admin.brands.placeholder.id', 'Например: matrix', 'Example: matrix', 'Piemers: matrix')}
                  onChange={(event) => setNewBrand((prev) => ({ ...prev, id: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.brands.field.name', 'Название', 'Name', 'Nosaukums')}</span>
                <Input
                  value={newBrand.name}
                  placeholder={tl('admin.brands.placeholder.name', 'Например: Matrix', 'Example: Matrix', 'Piemers: Matrix')}
                  onChange={(event) => setNewBrand((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.brands.field.popular', 'Популярный', 'Popular', 'Populars')}</span>
                <select
                  value={newBrand.popular ? 'yes' : 'no'}
                  onChange={(event) => setNewBrand((prev) => ({ ...prev, popular: event.target.value === 'yes' }))}
                  className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
                >
                  <option value="no">{tl('admin.brands.option.no', 'Нет', 'No', 'Ne')}</option>
                  <option value="yes">{tl('admin.brands.option.yes', 'Да', 'Yes', 'Ja')}</option>
                </select>
              </label>
              <label className="text-xs md:col-span-3">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.brands.field.logoPath', 'Путь к логотипу', 'Logo path', 'Logo cels')}</span>
                <Input
                  value={newBrand.logo}
                  placeholder={tl('admin.brands.placeholder.logoPath', '/brands/matrix.svg', '/brands/matrix.svg', '/brands/matrix.svg')}
                  onChange={(event) => setNewBrand((prev) => ({ ...prev, logo: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.brands.field.descriptionRu', 'Описание RU', 'Description RU', 'Apraksts RU')}</span>
                <Input
                  value={newBrand.descriptionRu}
                  placeholder={tl('admin.brands.placeholder.descriptionRu', 'Краткое описание бренда на русском', 'Short brand description in Russian', 'Iss zimola apraksts krievu valoda')}
                  onChange={(event) => setNewBrand((prev) => ({ ...prev, descriptionRu: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.brands.field.descriptionEn', 'Описание EN', 'Description EN', 'Apraksts EN')}</span>
                <Input
                  value={newBrand.descriptionEn}
                  placeholder={tl('admin.brands.placeholder.descriptionEn', 'Краткое описание бренда на английском', 'Short brand description in English', 'Iss zimola apraksts anglu valoda')}
                  onChange={(event) => setNewBrand((prev) => ({ ...prev, descriptionEn: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.brands.field.descriptionLv', 'Описание LV', 'Description LV', 'Apraksts LV')}</span>
                <Input
                  value={newBrand.descriptionLv}
                  placeholder={tl('admin.brands.placeholder.descriptionLv', 'Краткое описание бренда на латышском', 'Short brand description in Latvian', 'Iss zimola apraksts latviesu valoda')}
                  onChange={(event) => setNewBrand((prev) => ({ ...prev, descriptionLv: event.target.value }))}
                />
              </label>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {tl('admin.brands.cardPreview', 'Превью карточки', 'Card preview', 'Kartites priekskats')}
              </p>
              <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
                <div className="relative mx-auto h-12 w-24">
                  <img
                    src={newBrand.logo.trim() || '/brands/new-brand.svg'}
                    alt={newBrandTitle}
                    className="h-full w-full object-contain"
                    onError={(event) => {
                      event.currentTarget.onerror = null
                      event.currentTarget.src = '/brands/new-brand.svg'
                    }}
                  />
                </div>
                <p className="mt-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">{newBrandTitle}</p>
              </div>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <Button onClick={() => void handleCreateBrand()} disabled={saving}>
              {saving
                ? tl('admin.brands.saving', 'Сохранение...', 'Saving...', 'Saglabasana...')
                : tl('admin.brands.addBrand', 'Добавить бренд', 'Add brand', 'Pievienot zimolu')}
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {tl('admin.brands.existingBrands', 'Существующие бренды', 'Existing brands', 'Esosie zimoli')}
          </h2>

          {loading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {tl('admin.brands.loading', 'Загрузка брендов...', 'Loading brands...', 'Ieladejam zimolus...')}
            </div>
          ) : (
            brands.map((brand) => (
              <article key={brand.id} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{brand.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{brand.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => void handleSaveBrand()} disabled={saving}>
                      {saving
                        ? tl('admin.brands.saving', 'Сохранение...', 'Saving...', 'Saglabasana...')
                        : tl('admin.brands.save', 'Сохранить', 'Save', 'Saglabat')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleResetBrand(brand.id)} disabled={saving}>
                      {tl('admin.brands.reset', 'Сбросить', 'Reset', 'Atiestatit')}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => void handleDeleteBrand(brand.id)} disabled={saving}>
                      {tl('admin.brands.delete', 'Удалить', 'Delete', 'Dzest')}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="grid gap-2 md:grid-cols-3">
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.brands.field.name', 'Название', 'Name', 'Nosaukums')}</span>
                      <Input value={brand.name} onChange={(event) => updateBrand(brand.id, { name: event.target.value })} />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.brands.field.popular', 'Популярный', 'Popular', 'Populars')}</span>
                      <select
                        value={brand.popular ? 'yes' : 'no'}
                        onChange={(event) => updateBrand(brand.id, { popular: event.target.value === 'yes' })}
                        className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
                      >
                        <option value="no">{tl('admin.brands.option.no', 'Нет', 'No', 'Ne')}</option>
                        <option value="yes">{tl('admin.brands.option.yes', 'Да', 'Yes', 'Ja')}</option>
                      </select>
                    </label>
                    <label className="text-xs md:col-span-3">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.brands.field.logoPath', 'Путь к логотипу', 'Logo path', 'Logo cels')}</span>
                      <Input value={brand.logo} onChange={(event) => updateBrand(brand.id, { logo: event.target.value })} />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.brands.field.descriptionRu', 'Описание RU', 'Description RU', 'Apraksts RU')}</span>
                      <Input value={brand.description.ru} onChange={(event) => updateBrandDescription(brand.id, { ru: event.target.value })} />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.brands.field.descriptionEn', 'Описание EN', 'Description EN', 'Apraksts EN')}</span>
                      <Input value={brand.description.en} onChange={(event) => updateBrandDescription(brand.id, { en: event.target.value })} />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.brands.field.descriptionLv', 'Описание LV', 'Description LV', 'Apraksts LV')}</span>
                      <Input value={brand.description.lv} onChange={(event) => updateBrandDescription(brand.id, { lv: event.target.value })} />
                    </label>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/40">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {tl('admin.brands.cardPreview', 'Превью карточки', 'Card preview', 'Kartites priekskats')}
                    </p>
                    <div className="rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                      <div className="relative mx-auto h-12 w-24">
                        <img
                          src={brand.logo.trim() || '/brands/new-brand.svg'}
                          alt={brand.name}
                          className="h-full w-full object-contain"
                          onError={(event) => {
                            event.currentTarget.onerror = null
                            event.currentTarget.src = '/brands/new-brand.svg'
                          }}
                        />
                      </div>
                      <p className="mt-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">{brand.name}</p>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </main>
    </AdminGate>
  )
}
