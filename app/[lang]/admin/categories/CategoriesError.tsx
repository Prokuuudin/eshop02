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

export default function CategoriesError({ state }: { state: CategoriesState }): React.ReactElement {
 const { language, t, l, tl, categories, setCategories, savedCategories, deletedCategories, loading, saving, message, error, newCategory, setNewCategory, newSubByCategory, setNewSubByCategory, newCategoryPreviewLabel, updateCategoryLabels, updateSubcategoryLabels, handleCreateCategory, handleAddSubcategory, handleRemoveSubcategory, handleSaveCategory, handleResetCategoryChanges, handleMoveCategoryToTrash, handleRestoreCategory, handleDeleteCategoryForever } = state
 return <>{error && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </p>
        )}</>
}
