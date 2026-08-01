'use client'

import React from 'react'
import Image from 'next/image'
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

function AccessibleLabel({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}): React.ReactElement {
  const id = React.useId()
  return (
    <label htmlFor={id} className={className}>
      {React.Children.map(children, (child) =>
        React.isValidElement<{ id?: string }>(child) && child.type === Input
          ? React.cloneElement(child, { id })
          : child
      )}
    </label>
  )
}

import type { useAdminCategoriesPage } from './useAdminCategoriesPage'

type CategoriesState = ReturnType<typeof useAdminCategoriesPage>

export default function CategoriesHeader({ state }: { state: CategoriesState }): React.ReactElement {
 const { language, t, l, tl, categories, setCategories, savedCategories, deletedCategories, loading, saving, message, error, newCategory, setNewCategory, newSubByCategory, setNewSubByCategory, newCategoryPreviewLabel, updateCategoryLabels, updateSubcategoryLabels, handleCreateCategory, handleAddSubcategory, handleRemoveSubcategory, handleSaveCategory, handleResetCategoryChanges, handleMoveCategoryToTrash, handleRestoreCategory, handleDeleteCategoryForever } = state
 return <><div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {tl('admin.categories.title', 'ÐšÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ð¸: ÑƒÐ¿Ñ€Ð°Ð²Ð»ÐµÐ½Ð¸Ðµ ÑÑ‚Ñ€ÑƒÐºÑ‚ÑƒÑ€Ð¾Ð¹', 'Categories: structure management', 'Kategorijas: strukturas parvaldiba')}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {tl(
                  'admin.categories.subtitle',
                  'Ð¡Ð¾Ð·Ð´Ð°Ð²Ð°Ð¹Ñ‚Ðµ Ð½Ð¾Ð²Ñ‹Ðµ ÐºÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ð¸, Ð´Ð¾Ð±Ð°Ð²Ð»ÑÐ¹Ñ‚Ðµ Ð¸ ÑƒÐ´Ð°Ð»ÑÐ¹Ñ‚Ðµ Ð¿Ð¾Ð´Ð¿ÑƒÐ½ÐºÑ‚Ñ‹, Ñ€ÐµÐ´Ð°ÐºÑ‚Ð¸Ñ€ÑƒÐ¹Ñ‚Ðµ Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ñ Ð½Ð° RU/EN/LV.',
                  'Create categories, add/remove subcategories, edit labels in RU/EN/LV.',
                  'Izveidojiet kategorijas, pievienojiet/dzesiet apakskategorijas, redigejiet nosaukumus RU/EN/LV.'
                )}
              </p>
            </div>
            <Link href="/admin">
              <Button variant="outline">{tl('admin.categories.backToAdmin', 'ÐÐ°Ð·Ð°Ð´ Ð² Ð°Ð´Ð¼Ð¸Ð½ÐºÑƒ', 'Back to admin', 'Atpakal uz admin')}</Button>
            </Link>
          </div>
        </div></>
}
