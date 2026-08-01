'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronDown, Plus, Search } from 'lucide-react'
import AdminGate from '@/components/admin/AdminGate'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { BrandConfigItem, BrandsConfigPayload, LocalizedBrandDescription, BrandManufacturerInfo } from '@/lib/brands-config'
import { useTranslation } from '@/lib/use-translation'

type NewBrandDraft = {
  id: string
  name: string
  logo: string
  popular: boolean
  isDistributor: boolean
  allowLogo: boolean
  descriptionRu: string
  descriptionEn: string
  descriptionLv: string
}

const EMPTY_NEW_BRAND: NewBrandDraft = {
  id: '',
  name: '',
  logo: '/brands/new-brand.svg',
  popular: false,
  isDistributor: false,
  allowLogo: true,
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

import { useAdminBrandsPage } from './useAdminBrandsPage'

export default function AdminBrandsPage(): React.ReactElement {
  const pageState = useAdminBrandsPage()
  const { t, language, l, tl, brands, setBrands, savedBrands, setSavedBrands, loading, setLoading, saving, setSaving, message, setMessage, error, setError, newBrand, setNewBrand, search, setSearch, q, filteredBrands, saveBrands, updateBrand, updateBrandDescription, updateBrandManufacturer, updateBrandDistributor, handleCreateBrand, handleSaveBrand, handleResetBrand, handleDeleteBrand, newBrandTitle } = pageState
return (
    <AdminGate>
      <main className="w-full py-4 space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {tl('admin.brands.title', 'Бренды: управление', 'Brands: management', 'Zimoli: parvaldiba')}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
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
          <div className="mt-3 flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tl('admin.brands.searchPlaceholder', 'Поиск по названию или ID...', 'Search by name or ID...', 'Meklet pec nosaukuma vai ID...')}
              className="h-9 flex-1"
            />
            <Search className="h-5 w-5 text-gray-400" />
            <span className="whitespace-nowrap text-sm text-muted-foreground">
              {tl('admin.brands.search', 'Поиск', 'Search', 'Meklet')}
            </span>
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

        <Accordion type="single" collapsible>
          <AccordionItem value="new-brand" className="border-0">
            <AccordionTrigger className="group !border-0 !bg-transparent !p-0 !no-underline focus:!no-underline">
              <div className="flex cursor-pointer select-none items-center gap-3 rounded-lg bg-primary/5 px-4 py-3 transition hover:bg-primary/10">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Plus className="h-6 w-6" />
                </span>
                <span className="text-base font-semibold">
                  {tl('admin.brands.addBrand', 'Добавить бренд', 'Add brand', 'Pievienot zimolu')}
                </span>
                <ChevronDown className="ml-auto h-5 w-5 text-primary transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="grid gap-2 md:grid-cols-3">
              <label className="text-xs">
                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.idSlug', 'ID (slug)', 'ID (slug)', 'ID (slug)')}</span>
                <Input
                  value={newBrand.id}
                  placeholder={tl('admin.brands.placeholder.id', 'Например: matrix', 'Example: matrix', 'Piemers: matrix')}
                  onChange={(event) => setNewBrand((prev) => ({ ...prev, id: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.name', 'Название', 'Name', 'Nosaukums')}</span>
                <Input
                  value={newBrand.name}
                  placeholder={tl('admin.brands.placeholder.name', 'Например: Matrix', 'Example: Matrix', 'Piemers: Matrix')}
                  onChange={(event) => setNewBrand((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.popular', 'Популярный (на главной)', 'Featured (homepage)', 'Populārs (galvenaja)')}</span>
                <Select value={newBrand.popular ? 'yes' : 'no'} onValueChange={(v) => setNewBrand((prev) => ({ ...prev, popular: v === 'yes' }))}>
                  <SelectTrigger className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">{tl('admin.brands.option.no', 'Нет', 'No', 'Ne')}</SelectItem>
                    <SelectItem value="yes">{tl('admin.brands.option.yes', 'Да', 'Yes', 'Ja')}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.isDistributor', 'Дистрибьютор', 'Distributor', 'Distributors')}</span>
                <Select value={newBrand.isDistributor ? 'yes' : 'no'} onValueChange={(v) => setNewBrand((prev) => ({ ...prev, isDistributor: v === 'yes' }))}>
                  <SelectTrigger className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">{tl('admin.brands.option.no', 'Нет', 'No', 'Ne')}</SelectItem>
                    <SelectItem value="yes">{tl('admin.brands.option.yes', 'Да', 'Yes', 'Ja')}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.allowLogo', 'Разрешение на лого', 'Logo permission', 'Logo atlauja')}</span>
                <Select value={newBrand.allowLogo ? 'yes' : 'no'} onValueChange={(v) => setNewBrand((prev) => ({ ...prev, allowLogo: v === 'yes' }))}>
                  <SelectTrigger className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">{tl('admin.brands.option.no', 'Нет', 'No', 'Ne')}</SelectItem>
                    <SelectItem value="yes">{tl('admin.brands.option.yes', 'Да', 'Yes', 'Ja')}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="text-xs md:col-span-3">
                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.logoPath', 'Путь к логотипу', 'Logo path', 'Logo cels')}</span>
                <Input
                  value={newBrand.logo}
                  placeholder={tl('admin.brands.placeholder.logoPath', '/brands/matrix.svg', '/brands/matrix.svg', '/brands/matrix.svg')}
                  onChange={(event) => setNewBrand((prev) => ({ ...prev, logo: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.descriptionRu', 'Описание RU', 'Description RU', 'Apraksts RU')}</span>
                <Input
                  value={newBrand.descriptionRu}
                  placeholder={tl('admin.brands.placeholder.descriptionRu', 'Краткое описание бренда на русском', 'Short brand description in Russian', 'Iss zimola apraksts krievu valoda')}
                  onChange={(event) => setNewBrand((prev) => ({ ...prev, descriptionRu: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.descriptionEn', 'Описание EN', 'Description EN', 'Apraksts EN')}</span>
                <Input
                  value={newBrand.descriptionEn}
                  placeholder={tl('admin.brands.placeholder.descriptionEn', 'Краткое описание бренда на английском', 'Short brand description in English', 'Iss zimola apraksts anglu valoda')}
                  onChange={(event) => setNewBrand((prev) => ({ ...prev, descriptionEn: event.target.value }))}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.descriptionLv', 'Описание LV', 'Description LV', 'Apraksts LV')}</span>
                <Input
                  value={newBrand.descriptionLv}
                  placeholder={tl('admin.brands.placeholder.descriptionLv', 'Краткое описание бренда на латышском', 'Short brand description in Latvian', 'Iss zimola apraksts latviesu valoda')}
                  onChange={(event) => setNewBrand((prev) => ({ ...prev, descriptionLv: event.target.value }))}
                />
              </label>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {tl('admin.brands.cardPreview', 'Превью карточки', 'Card preview', 'Kartites priekskats')}
              </p>
              <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
                <div className="relative mx-auto h-12 w-24">
                  <Image
                    unoptimized
                    src={newBrand.logo.trim() || '/brands/new-brand.svg'}
                    alt={newBrandTitle}
                    width={96}
                    height={48}
                    className="h-full w-full object-contain"
                    onError={(event) => {
                      event.currentTarget.onerror = null
                      event.currentTarget.src = '/brands/new-brand.svg'
                    }}
                  />
                </div>
                <p className="mt-2 text-center text-sm font-medium text-foreground">{newBrandTitle}</p>
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
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            {tl('admin.brands.existingBrands', 'Существующие бренды', 'Existing brands', 'Esosie zimoli')}
          </h2>

          {loading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {tl('admin.brands.loading', 'Загрузка брендов...', 'Loading brands...', 'Ieladejam zimolus...')}
            </div>
          ) : filteredBrands.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
              {tl('admin.brands.noResults', 'Бренды не найдены', 'No brands found', 'Zimoli nav atrasti')}
            </div>
          ) : (
            filteredBrands.map((brand) => (
              <article key={brand.id} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{brand.name}</h3>
                    <p className="text-xs text-muted-foreground">{brand.id}</p>
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
                      <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.name', 'Название', 'Name', 'Nosaukums')}</span>
                      <Input value={brand.name} onChange={(event) => updateBrand(brand.id, { name: event.target.value })} />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.popular', 'Популярный (на главной)', 'Featured (homepage)', 'Populārs (galvenaja)')}</span>
                      <Select value={brand.popular ? 'yes' : 'no'} onValueChange={(v) => updateBrand(brand.id, { popular: v === 'yes' })}>
                        <SelectTrigger className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">{tl('admin.brands.option.no', 'Нет', 'No', 'Ne')}</SelectItem>
                          <SelectItem value="yes">{tl('admin.brands.option.yes', 'Да', 'Yes', 'Ja')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.isDistributor', 'Дистрибьютор', 'Distributor', 'Distributors')}</span>
                      <Select value={brand.isDistributor ? 'yes' : 'no'} onValueChange={(v) => updateBrand(brand.id, { isDistributor: v === 'yes' })}>
                        <SelectTrigger className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">{tl('admin.brands.option.no', 'Нет', 'No', 'Ne')}</SelectItem>
                          <SelectItem value="yes">{tl('admin.brands.option.yes', 'Да', 'Yes', 'Ja')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.allowLogo', 'Разрешение на лого', 'Logo permission', 'Logo atlauja')}</span>
                      <Select value={brand.allowLogo ? 'yes' : 'no'} onValueChange={(v) => updateBrand(brand.id, { allowLogo: v === 'yes' })}>
                        <SelectTrigger className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">{tl('admin.brands.option.no', 'Нет', 'No', 'Ne')}</SelectItem>
                          <SelectItem value="yes">{tl('admin.brands.option.yes', 'Да', 'Yes', 'Ja')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="text-xs md:col-span-3">
                      <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.logoPath', 'Путь к логотипу', 'Logo path', 'Logo cels')}</span>
                      <Input value={brand.logo} onChange={(event) => updateBrand(brand.id, { logo: event.target.value })} />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.descriptionRu', 'Описание RU', 'Description RU', 'Apraksts RU')}</span>
                      <Input value={brand.description.ru} onChange={(event) => updateBrandDescription(brand.id, { ru: event.target.value })} />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.descriptionEn', 'Описание EN', 'Description EN', 'Apraksts EN')}</span>
                      <Input value={brand.description.en} onChange={(event) => updateBrandDescription(brand.id, { en: event.target.value })} />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.descriptionLv', 'Описание LV', 'Description LV', 'Apraksts LV')}</span>
                      <Input value={brand.description.lv} onChange={(event) => updateBrandDescription(brand.id, { lv: event.target.value })} />
                    </label>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/40">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {tl('admin.brands.cardPreview', 'Превью карточки', 'Card preview', 'Kartites priekskats')}
                    </p>
                    <div className="rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                      <div className="relative mx-auto h-12 w-24">
                        <Image
                          unoptimized
                          src={brand.logo.trim() || '/brands/new-brand.svg'}
                          alt={brand.name}
                          width={96}
                          height={48}
                          className="h-full w-full object-contain"
                          onError={(event) => {
                            event.currentTarget.onerror = null
                            event.currentTarget.src = '/brands/new-brand.svg'
                          }}
                        />
                      </div>
                      <p className="mt-2 text-center text-sm font-medium text-foreground">{brand.name}</p>
                    </div>
                  </div>
                </div>

                <div className="admin-brands__legal-section mt-3">
                  <Accordion type="single" collapsible>
                    <AccordionItem value="legal" className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <AccordionTrigger className="px-4 py-2 text-sm font-medium hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50 [&>svg]:shrink-0">
                        <span className="flex items-center gap-2">
                          {tl('admin.brands.field.manufacturerSection', 'Производитель / Дистрибьютор (EU)', 'Manufacturer / Distributor (EU)', 'Ražotājs / Izplatītājs (ES)')}
                          {(brand.manufacturer?.name || brand.manufacturer?.address || brand.manufacturer?.email ||
                            brand.distributor?.name || brand.distributor?.address || brand.distributor?.email) && (
                            <span className="inline-block h-2 w-2 rounded-full bg-green-500" title={tl('admin.brands.field.hasData', 'Данные заполнены', 'Data filled', 'Dati aizpildīti')} />
                          )}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 pt-2">
                        <div className="grid gap-4">
                          <div className="admin-brands__manufacturer-group">
                            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              {tl('admin.brands.field.manufacturer', 'Производитель', 'Manufacturer', 'Ražotājs')}
                            </p>
                            <div className="admin-brands__legal-fields grid gap-2 md:grid-cols-3">
                              <label className="text-xs">
                                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.mfgName', 'Полное наименование', 'Full name', 'Pilns nosaukums')}</span>
                                <Input
                                  value={brand.manufacturer?.name || ''}
                                  onChange={(e) => updateBrandManufacturer(brand.id, { name: e.target.value })}
                                />
                              </label>
                              <label className="text-xs">
                                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.mfgAddress', 'Почтовый адрес', 'Postal address', 'Pasta adrese')}</span>
                                <Input
                                  value={brand.manufacturer?.address || ''}
                                  onChange={(e) => updateBrandManufacturer(brand.id, { address: e.target.value })}
                                />
                              </label>
                              <label className="text-xs">
                                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.mfgEmail', 'E-mail', 'E-mail', 'E-pasts')}</span>
                                <Input
                                  value={brand.manufacturer?.email || ''}
                                  onChange={(e) => updateBrandManufacturer(brand.id, { email: e.target.value })}
                                />
                              </label>
                            </div>
                          </div>
                          <div className="admin-brands__distributor-group">
                            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              {tl('admin.brands.field.distributor', 'Дистрибьютор в ЕС', 'EU Distributor', 'ES Izplatītājs')}
                            </p>
                            <div className="admin-brands__legal-fields grid gap-2 md:grid-cols-3">
                              <label className="text-xs">
                                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.distName', 'Наименование', 'Name', 'Nosaukums')}</span>
                                <Input
                                  value={brand.distributor?.name || ''}
                                  onChange={(e) => updateBrandDistributor(brand.id, { name: e.target.value })}
                                />
                              </label>
                              <label className="text-xs">
                                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.distAddress', 'Почтовый адрес', 'Postal address', 'Pasta adrese')}</span>
                                <Input
                                  value={brand.distributor?.address || ''}
                                  onChange={(e) => updateBrandDistributor(brand.id, { address: e.target.value })}
                                />
                              </label>
                              <label className="text-xs">
                                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.distEmail', 'E-mail', 'E-mail', 'E-pasts')}</span>
                                <Input
                                  value={brand.distributor?.email || ''}
                                  onChange={(e) => updateBrandDistributor(brand.id, { email: e.target.value })}
                                />
                              </label>
                            </div>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </article>
            ))
          )}
        </section>
      </main>
    </AdminGate>
  )
}
