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

export default function DeletedCategoriesSection({ state }: { state: CategoriesState }): React.ReactElement {
 const { language, t, l, tl, categories, setCategories, savedCategories, deletedCategories, loading, saving, message, error, newCategory, setNewCategory, newSubByCategory, setNewSubByCategory, newCategoryPreviewLabel, updateCategoryLabels, updateSubcategoryLabels, handleCreateCategory, handleAddSubcategory, handleRemoveSubcategory, handleSaveCategory, handleResetCategoryChanges, handleMoveCategoryToTrash, handleRestoreCategory, handleDeleteCategoryForever } = state
 return <><section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-foreground">
            {tl('admin.categories.trashTitle', 'ÐšÐ¾Ñ€Ð·Ð¸Ð½Ð° ÐºÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ð¹', 'Categories trash', 'Kategoriju grozs')} ({deletedCategories.length})
          </h2>

          {deletedCategories.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{tl('admin.categories.trashEmpty', 'ÐšÐ¾Ñ€Ð·Ð¸Ð½Ð° Ð¿ÑƒÑÑ‚Ð°', 'Trash is empty', 'Grozs ir tukss')}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {deletedCategories.map((category) => (
                <div key={`trash-${category.id}`} className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">{category.id}</span>
                  <span className="text-sm text-foreground">{category.labels[language] || category.id}</span>
                  <span className="text-xs text-muted-foreground">{tl('admin.categories.subcategoriesCount', 'ÐŸÐ¾Ð´Ð¿ÑƒÐ½ÐºÑ‚Ð¾Ð²', 'Subcategories', 'Apakskategorijas')}: {category.subcategories.length}</span>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void handleRestoreCategory(category.id)} disabled={saving}>
                      {tl('admin.categories.restoreButton', 'Ð’Ð¾ÑÑÑ‚Ð°Ð½Ð¾Ð²Ð¸Ñ‚ÑŒ', 'Restore', 'Atjaunot')}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => void handleDeleteCategoryForever(category.id)} disabled={saving}>
                      {tl('admin.categories.deleteForeverButton', 'Ð£Ð´Ð°Ð»Ð¸Ñ‚ÑŒ Ð½Ð°Ð²ÑÐµÐ³Ð´Ð°', 'Delete forever', 'Dzest neatgriezeniski')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section></>
}
