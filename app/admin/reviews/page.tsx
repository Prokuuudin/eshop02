'use client'

import React, { useEffect, useMemo, useState } from 'react'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/use-translation'

type ReviewStatus = 'approved' | 'hidden' | 'pending'

type ReviewRecord = {
  id: string
  productId: string
  author: string
  rating: number
  title: string
  text: string
  createdAt: string
  helpful: number
  status: ReviewStatus
}

export default function AdminReviewsPage() {
  const { t, language } = useTranslation()
  const l = (ru: string, en: string, lv: string) => (language === 'ru' ? ru : language === 'lv' ? lv : en)
  const tl = (key: string, ru: string, en: string, lv: string, params?: Record<string, string | number>) => t(key, l(ru, en, lv), params)
  const STATUS_LABELS: Record<ReviewStatus, string> = {
    approved: tl('admin.reviews.status.approved', 'Показывается', 'Visible', 'Redzams'),
    hidden: tl('admin.reviews.status.hidden', 'Скрыт', 'Hidden', 'Slepts'),
    pending: tl('admin.reviews.status.pending', 'На модерации', 'Pending moderation', 'Moderacija')
  }

  const [reviews, setReviews] = useState<ReviewRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | ReviewStatus>('all')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadReviews = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status !== 'all') params.set('status', status)
      if (search.trim()) params.set('search', search.trim())

      const response = await fetch(`/api/admin/reviews?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('reviews-load-failed')

      const payload = (await response.json()) as { data?: { reviews?: ReviewRecord[] } }
      const nextReviews = payload.data?.reviews ?? []
      setReviews(nextReviews)
      setSelectedReviewIds((prev) => prev.filter((id) => nextReviews.some((review) => review.id === id)))
      setError('')
    } catch {
      setReviews([])
      setSelectedReviewIds([])
      setError(tl('admin.reviews.msg.loadFailed', 'Не удалось загрузить отзывы', 'Failed to load reviews', 'Neizdevas ieladet atsauksmes'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadReviews()
  }, [status])

  const filteredClientSide = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return reviews
    return reviews.filter((review) => `${review.productId} ${review.author} ${review.title} ${review.text}`.toLowerCase().includes(q))
  }, [reviews, search])

  const selectedCount = selectedReviewIds.length
  const allVisibleSelected = filteredClientSide.length > 0 && filteredClientSide.every((review) => selectedReviewIds.includes(review.id))

  const toggleReviewSelection = (reviewId: string, checked: boolean) => {
    setSelectedReviewIds((prev) => {
      if (checked) return Array.from(new Set([...prev, reviewId]))
      return prev.filter((id) => id !== reviewId)
    })
  }

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedReviewIds((prev) => {
      const visibleIds = filteredClientSide.map((review) => review.id)
      if (checked) {
        return Array.from(new Set([...prev, ...visibleIds]))
      }
      return prev.filter((id) => !visibleIds.includes(id))
    })
  }

  const applyBulkStatus = async (nextStatus: ReviewStatus) => {
    if (selectedReviewIds.length === 0) return

    setBulkSaving(true)
    try {
      const response = await fetch('/api/admin/reviews', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: selectedReviewIds, status: nextStatus })
      })

      if (!response.ok) throw new Error('bulk-status-update-failed')

      setMessage(tl(
        'admin.reviews.msg.bulkStatusUpdated',
        'Массовое обновление: {count} отзыв(ов) -> {status}',
        'Bulk update: {count} review(s) -> {status}',
        'Masveida atjaunojums: {count} atsauksme(s) -> {status}',
        { count: selectedReviewIds.length, status: STATUS_LABELS[nextStatus] }
      ))
      setError('')
      setSelectedReviewIds([])
      await loadReviews()
    } catch {
      setMessage('')
      setError(tl('admin.reviews.msg.bulkStatusFailed', 'Не удалось выполнить массовое обновление статуса', 'Failed to perform bulk status update', 'Neizdevas veikt masveida statusa atjaunosanu'))
    } finally {
      setBulkSaving(false)
    }
  }

  const removeSelectedReviews = async () => {
    if (selectedReviewIds.length === 0) return

    const confirmed = window.confirm(tl(
      'admin.reviews.confirm.deleteSelected',
      'Удалить выбранные отзывы ({count}) без возможности восстановления?',
      'Delete selected reviews ({count}) permanently?',
      'Dzest atlasitas atsauksmes ({count}) neatgriezeniski?',
      { count: selectedReviewIds.length }
    ))
    if (!confirmed) return

    setBulkSaving(true)
    try {
      const response = await fetch('/api/admin/reviews', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: selectedReviewIds })
      })

      if (!response.ok) throw new Error('bulk-review-delete-failed')

      setMessage(tl(
        'admin.reviews.msg.bulkDeleted',
        'Удалено отзывов: {count}',
        'Deleted reviews: {count}',
        'Dzesu atsauksmju skaits: {count}',
        { count: selectedReviewIds.length }
      ))
      setError('')
      setSelectedReviewIds([])
      await loadReviews()
    } catch {
      setMessage('')
      setError(tl('admin.reviews.msg.bulkDeleteFailed', 'Не удалось удалить выбранные отзывы', 'Failed to delete selected reviews', 'Neizdevas dzest atlasitas atsauksmes'))
    } finally {
      setBulkSaving(false)
    }
  }

  const updateStatus = async (id: string, nextStatus: ReviewStatus) => {
    setSavingId(id)
    try {
      const response = await fetch('/api/admin/reviews', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id, status: nextStatus })
      })

      if (!response.ok) throw new Error('status-update-failed')

      setMessage(tl(
        'admin.reviews.msg.statusUpdated',
        'Статус отзыва {id} обновлен: {status}',
        'Review {id} status updated: {status}',
        'Atsauksmes {id} statuss atjaunots: {status}',
        { id, status: STATUS_LABELS[nextStatus] }
      ))
      setError('')
      await loadReviews()
    } catch {
      setMessage('')
      setError(tl('admin.reviews.msg.statusUpdateFailed', 'Не удалось обновить статус отзыва {id}', 'Failed to update review status {id}', 'Neizdevas atjaunot atsauksmes statusu {id}', { id }))
    } finally {
      setSavingId(null)
    }
  }

  const removeReview = async (id: string) => {
    const confirmed = window.confirm(tl(
      'admin.reviews.confirm.deleteOne',
      'Удалить отзыв {id} без возможности восстановления?',
      'Delete review {id} permanently?',
      'Dzest atsauksmi {id} neatgriezeniski?',
      { id }
    ))
    if (!confirmed) return

    setSavingId(id)
    try {
      const response = await fetch('/api/admin/reviews', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id })
      })

      if (!response.ok) throw new Error('review-delete-failed')

      setMessage(tl('admin.reviews.msg.deletedOne', 'Отзыв {id} удален', 'Review {id} deleted', 'Atsauksme {id} izdzesta', { id }))
      setError('')
      await loadReviews()
    } catch {
      setMessage('')
      setError(tl('admin.reviews.msg.deleteOneFailed', 'Не удалось удалить отзыв {id}', 'Failed to delete review {id}', 'Neizdevas dzest atsauksmi {id}', { id }))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <AdminGate>
      <main className="w-full space-y-3 text-gray-900 dark:text-gray-100">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <h1 className="text-2xl font-bold">{l('Отзывы: модерация', 'Reviews: moderation', 'Atsauksmes: moderacija')}</h1>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            {l('Просмотр, скрытие, возврат в публикацию и удаление отзывов.', 'View, hide, restore publication, and delete reviews.', 'Skatisana, slegsana, publicesanas atjaunosana un dzesana.')}
          </p>

          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(260px,420px)_180px_auto] md:items-center">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={l('Поиск по товару, автору, заголовку и тексту', 'Search by product, author, title and text', 'Meklet pec produkta, autora, virsraksta un teksta')}
              className="h-9"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as 'all' | ReviewStatus)}
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <option value="all">{l('Все статусы', 'All statuses', 'Visi statusi')}</option>
              <option value="approved">{STATUS_LABELS.approved}</option>
              <option value="hidden">{STATUS_LABELS.hidden}</option>
              <option value="pending">{STATUS_LABELS.pending}</option>
            </select>
            <p className="text-xs text-gray-600 dark:text-gray-300">{l('Всего', 'Total', 'Kopa')}: {filteredClientSide.length}</p>
          </div>

          <div className="mt-3 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleSelectAllVisible(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                {l('Выбрать все видимые', 'Select all visible', 'Atlasit visas redzamas')}
              </label>

              <span className="text-xs text-gray-500 dark:text-gray-400">{l('Выбрано', 'Selected', 'Atlasits')}: {selectedCount}</span>

              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={bulkSaving || selectedCount === 0} onClick={() => void applyBulkStatus('approved')}>
                  {l('Показать выбранные', 'Show selected', 'Radit atlasitas')}
                </Button>
                <Button size="sm" variant="outline" disabled={bulkSaving || selectedCount === 0} onClick={() => void applyBulkStatus('pending')}>
                  {l('На модерацию', 'Send to moderation', 'Uz moderaciju')}
                </Button>
                <Button size="sm" variant="outline" disabled={bulkSaving || selectedCount === 0} onClick={() => void applyBulkStatus('hidden')}>
                  {l('Скрыть выбранные', 'Hide selected', 'Slept atlasitas')}
                </Button>
                <Button size="sm" variant="destructive" disabled={bulkSaving || selectedCount === 0} onClick={() => void removeSelectedReviews()}>
                  {l('Удалить выбранные', 'Delete selected', 'Dzest atlasitas')}
                </Button>
              </div>
            </div>
          </div>

          {message && (
            <p className="mt-3 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-200">
              {message}
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
              {error}
            </p>
          )}
        </div>

        <div className="space-y-2">
          {loading && (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {l('Загрузка отзывов...', 'Loading reviews...', 'Ielade atsauksmes...')}
            </div>
          )}

          {!loading && filteredClientSide.map((review) => {
            const isSaving = bulkSaving || savingId === review.id
            const isSelected = selectedReviewIds.includes(review.id)

            return (
              <article key={review.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex flex-wrap items-start gap-2">
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(event) => toggleReviewSelection(review.id, event.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </label>
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">{review.id}</span>
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">{l('Товар', 'Product', 'Produkts')}: {review.productId}</span>
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">{STATUS_LABELS[review.status]}</span>
                  <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">{new Date(review.createdAt).toLocaleString(language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US')}</span>
                </div>

                <div className="mt-2 space-y-1">
                  <p className="text-sm font-semibold">{review.title}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300">{l('Автор', 'Author', 'Autors')}: {review.author} · {l('Оценка', 'Rating', 'Vertejums')}: {review.rating} · {l('Полезно', 'Helpful', 'Noderigi')}: {review.helpful}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{review.text}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={isSaving} onClick={() => void updateStatus(review.id, 'approved')}>
                    {l('Показать', 'Show', 'Radit')}
                  </Button>
                  <Button size="sm" variant="outline" disabled={isSaving} onClick={() => void updateStatus(review.id, 'pending')}>
                    {l('На модерацию', 'Send to moderation', 'Uz moderaciju')}
                  </Button>
                  <Button size="sm" variant="outline" disabled={isSaving} onClick={() => void updateStatus(review.id, 'hidden')}>
                    {l('Скрыть', 'Hide', 'Slept')}
                  </Button>
                  <Button size="sm" variant="destructive" disabled={isSaving} onClick={() => void removeReview(review.id)}>
                    {l('Удалить', 'Delete', 'Dzest')}
                  </Button>
                </div>
              </article>
            )
          })}

          {!loading && filteredClientSide.length === 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {l('Отзывы не найдены.', 'No reviews found.', 'Atsauksmes nav atrastas.')}
            </div>
          )}
        </div>
      </main>
    </AdminGate>
  )
}
