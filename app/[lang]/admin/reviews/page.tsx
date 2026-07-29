'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
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
  adminReply?: { text: string; repliedAt: string }
}

export default function AdminReviewsPage(): React.ReactElement {
  const { t, language } = useTranslation()
  const l = useCallback(
    (ru: string, en: string, lv: string) => (language === 'ru' ? ru : language === 'lv' ? lv : en),
    [language]
  )
  const tl = useCallback(
    (key: string, ru: string, en: string, lv: string, params?: Record<string, string | number>) =>
      t(key, l(ru, en, lv), params),
    [l, t]
  )
  const STATUS_LABELS: Record<ReviewStatus, string> = {
    approved: tl('admin.reviews.status.approved', 'Показывается', 'Visible', 'Redzams'),
    hidden: tl('admin.reviews.status.hidden', 'Скрыт', 'Hidden', 'Slepts'),
    pending: tl('admin.reviews.status.pending', 'На модерации', 'Pending moderation', 'Moderacija')
  }

  const STATUS_COLORS: Record<ReviewStatus, string> = {
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200',
    hidden: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
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
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replyExpanded, setReplyExpanded] = useState<Set<string>>(new Set())
  const [replySavingId, setReplySavingId] = useState<string | null>(null)

  const loadReviews = useCallback(async () => {
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
  }, [search, status, tl])

  useEffect(() => {
    queueMicrotask(() => void loadReviews())
  }, [loadReviews])

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

  const toggleReply = (id: string, existingReply?: string) => {
    setReplyExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else {
        next.add(id)
        if (!replyDrafts[id] && existingReply) {
          setReplyDrafts((d) => ({ ...d, [id]: existingReply }))
        }
      }
      return next
    })
  }

  const saveReply = async (id: string) => {
    const text = (replyDrafts[id] ?? '').trim()
    if (!text) return
    setReplySavingId(id)
    try {
      const res = await fetch('/api/admin/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reply: text }),
      })
      if (!res.ok) throw new Error()
      setReplyExpanded((prev) => { const n = new Set(prev); n.delete(id); return n })
      await loadReviews()
    } catch {
      setError(l('Не удалось сохранить ответ', 'Failed to save reply', 'Neizdevas saglabat atbildi'))
    } finally {
      setReplySavingId(null)
    }
  }

  const removeReply = async (id: string) => {
    setReplySavingId(id)
    try {
      const res = await fetch('/api/admin/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reply: null }),
      })
      if (!res.ok) throw new Error()
      setReplyDrafts((d) => { const n = { ...d }; delete n[id]; return n })
      setReplyExpanded((prev) => { const n = new Set(prev); n.delete(id); return n })
      await loadReviews()
    } catch {
      setError(l('Не удалось удалить ответ', 'Failed to delete reply', 'Neizdevas dzest atbildi'))
    } finally {
      setReplySavingId(null)
    }
  }

  return (
    <AdminGate>
      <main className="w-full space-y-3 text-foreground">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <h1 className="text-2xl font-bold">{l('Отзывы: модерация', 'Reviews: moderation', 'Atsauksmes: moderacija')}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {l('Просмотр, скрытие, возврат в публикацию и удаление отзывов.', 'View, hide, restore publication, and delete reviews.', 'Skatisana, slegsana, publicesanas atjaunosana un dzesana.')}
          </p>

          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(260px,420px)_180px_auto] md:items-center">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={l('Поиск по товару, автору, заголовку и тексту', 'Search by product, author, title and text', 'Meklet pec produkta, autora, virsraksta un teksta')}
              className="h-9"
            />
            <Select value={status} onValueChange={(v) => setStatus(v as 'all' | ReviewStatus)}>
              <SelectTrigger className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{l('Все статусы', 'All statuses', 'Visi statusi')}</SelectItem>
                <SelectItem value="approved">{STATUS_LABELS.approved}</SelectItem>
                <SelectItem value="hidden">{STATUS_LABELS.hidden}</SelectItem>
                <SelectItem value="pending">{STATUS_LABELS.pending}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{l('Всего', 'Total', 'Kopa')}: {filteredClientSide.length}</p>
          </div>

          <div className="mt-3 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                />
                {l('Выбрать все видимые', 'Select all visible', 'Atlasit visas redzamas')}
              </label>

              <span className="text-xs text-muted-foreground">{l('Выбрано', 'Selected', 'Atlasits')}: {selectedCount}</span>

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
                  <label htmlFor={`select-review-${review.id}`} className="inline-flex items-center">
                    <Checkbox
                      id={`select-review-${review.id}`}
                      checked={isSelected}
                      onCheckedChange={(checked) => toggleReviewSelection(review.id, checked === true)}
                    />
                  </label>
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">{review.id}</span>
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">{l('Товар', 'Product', 'Produkts')}: {review.productId}</span>
                  <span className={`rounded px-2 py-1 text-xs font-medium ${STATUS_COLORS[review.status]}`}>{STATUS_LABELS[review.status]}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleString(language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US')}</span>
                </div>

                <div className="mt-2 space-y-1">
                  <p className="text-sm font-semibold">{review.title}</p>
                  <p className="text-xs text-muted-foreground">{l('Автор', 'Author', 'Autors')}: {review.author} · {l('Оценка', 'Rating', 'Vertejums')}: {review.rating} · {l('Полезно', 'Helpful', 'Noderigi')}: {review.helpful}</p>
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
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isSaving}
                    onClick={() => toggleReply(review.id, review.adminReply?.text)}
                    className="ml-auto border-primary/50 text-primary hover:bg-primary/5 dark:border-primary/50 dark:text-primary dark:hover:bg-primary/10"
                  >
                    {review.adminReply
                      ? (replyExpanded.has(review.id) ? l('Закрыть', 'Close', 'Aizvert') : l('Изменить ответ', 'Edit reply', 'Labot atbildi'))
                      : (replyExpanded.has(review.id) ? l('Закрыть', 'Close', 'Aizvert') : l('Ответить', 'Reply', 'Atbildet'))}
                  </Button>
                </div>

                {/* Existing reply preview */}
                {review.adminReply && !replyExpanded.has(review.id) && (
                  <div className="mt-2 ml-2 rounded-lg border-l-[3px] border-primary/70 dark:border-primary bg-primary/5 dark:bg-primary/10 px-3 py-2">
                    <p className="text-xs font-semibold text-primary dark:text-primary mb-0.5">
                      {l('Ответ магазина', 'Store reply', 'Veikala atbilde')}
                    </p>
                    <p className="text-xs text-gray-700 dark:text-gray-300">{review.adminReply.text}</p>
                  </div>
                )}

                {/* Reply editor */}
                {replyExpanded.has(review.id) && (
                  <div className="mt-3 space-y-2 rounded-lg border border-primary/30 dark:border-primary/40 bg-primary/5 dark:bg-primary/20/10 p-3">
                    <p className="text-xs font-semibold text-primary dark:text-primary">
                      {l('Ответ от магазина (публичный)', 'Store reply (public)', 'Veikala atbilde (publiska)')}
                    </p>
                    <textarea
                      rows={3}
                      value={replyDrafts[review.id] ?? review.adminReply?.text ?? ''}
                      onChange={(e) => setReplyDrafts((d) => ({ ...d, [review.id]: e.target.value }))}
                      placeholder={l('Напишите ответ покупателю...', 'Write a reply to the customer...', 'Rakstiet atbildi klientam...')}
                      className="w-full rounded-md border border-primary/30 dark:border-primary/50 bg-card px-3 py-2 text-sm text-foreground placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={replySavingId === review.id || !(replyDrafts[review.id] ?? '').trim()}
                        onClick={() => void saveReply(review.id)}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      >
                        {replySavingId === review.id ? l('Сохранение...', 'Saving...', 'Saglaba...') : l('Сохранить ответ', 'Save reply', 'Saglabat atbildi')}
                      </Button>
                      {review.adminReply && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={replySavingId === review.id}
                          onClick={() => void removeReply(review.id)}
                          className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700"
                        >
                          {l('Удалить ответ', 'Delete reply', 'Dzest atbildi')}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
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
