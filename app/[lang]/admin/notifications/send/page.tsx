'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useTranslation } from '@/lib/use-translation'
import { reportAdminError } from '@/lib/admin-ui-errors'

type DbUser = {
  id: string
  email: string
  name: string | null
}

type NotificationType = 'info' | 'success' | 'warning' | 'promo'
type Channel = 'app' | 'email' | 'both'

type SendResult = {
  created?: number
  emailsSent?: number
  emailsFailed?: number
}

export default function AdminNotificationsSendPage(): React.ReactElement {
  const { t } = useTranslation()

  // Users state
  const [users, setUsers] = useState<DbUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Form state
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState<NotificationType>('info')
  const [link, setLink] = useState('')
  const [channel, setChannel] = useState<Channel>('app')

  // Send state
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [sendError, setSendError] = useState('')

  // Load users on mount
  useEffect(() => {
    fetch('/api/admin/users?take=200')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load users')
        return res.json()
      })
      .then((data) => {
        if (Array.isArray(data.users)) {
          setUsers(data.users)
        }
      })
      .catch((error) => reportAdminError(error, 'Получатели рассылки'))
      .finally(() => {
        setUsersLoading(false)
      })
  }, [])

  // Filtered users
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name ?? '').toLowerCase().includes(q)
    )
  }, [users, search])

  const allFilteredSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((u) => selectedIds.has(u.id))

  const toggleUser = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      filteredUsers.forEach((u) => next.add(u.id))
      return next
    })
  }

  const deselectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      filteredUsers.forEach((u) => next.delete(u.id))
      return next
    })
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const validate = (): string[] => {
    const errs: string[] = []
    if (selectedIds.size === 0) errs.push(t('admin.notifications.error.noRecipients'))
    if (!title.trim()) errs.push(t('admin.notifications.error.noTitle'))
    if (!message.trim()) errs.push(t('admin.notifications.error.noMessage'))
    return errs
  }

  const handleSend = async () => {
    setResult(null)
    setSendError('')
    const errs = validate()
    if (errs.length > 0) {
      setErrors(errs)
      return
    }
    setErrors([])
    setSending(true)
    try {
      const res = await fetch('/api/admin/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: Array.from(selectedIds),
          title: title.trim(),
          message: message.trim(),
          type,
          link: link.trim() || undefined,
          channel,
        }),
      })
      let data: Record<string, unknown> = {}
      try { data = await res.json() } catch {}
      if (!res.ok) {
        setSendError(typeof data.error === 'string' ? data.error : 'Error')
      } else {
        setResult(data as typeof result)
      }
    } catch {
      setSendError('Network error')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="w-full py-4 space-y-6 text-foreground">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">{t('admin.notifications.title')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('admin.notifications.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: User selection */}
          <section className="rounded-lg border border-border bg-card p-6 space-y-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('admin.notifications.form.search')}
              </label>
              <Input
                placeholder={t('admin.notifications.form.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Select all / Deselect all controls */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={allFilteredSelected ? deselectAll : selectAll}
                className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                {allFilteredSelected ? t('admin.notifications.form.clearSelection') : t('admin.notifications.form.selectAll')}
              </button>
              {selectedIds.size > 0 && (
                <>
                  <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                    {t('admin.notifications.form.selectedCount', undefined, { count: selectedIds.size })}
                  </span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    {t('admin.notifications.form.clearSelection')}
                  </button>
                </>
              )}
            </div>

            {/* User list */}
            <div className="max-h-80 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {usersLoading ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  {t('common.loading')}
                </p>
              ) : filteredUsers.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  {t('admin.notifications.form.noUsers')}
                </p>
              ) : (
                filteredUsers.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <Checkbox
                      checked={selectedIds.has(u.id)}
                      onCheckedChange={() => toggleUser(u.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-mono truncate">{u.email}</p>
                      {u.name && (
                        <p className="text-xs text-muted-foreground truncate">{u.name}</p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </section>

          {/* Right: Notification form */}
          <section className="rounded-lg border border-border bg-card p-6 space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('admin.notifications.form.title')}
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <Input
                placeholder={t('admin.notifications.form.titlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('admin.notifications.form.message')}
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <Textarea
                placeholder={t('admin.notifications.form.messagePlaceholder')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('admin.notifications.form.type')}
              </label>
              <Select value={type} onValueChange={(v) => setType(v as NotificationType)}>
                <SelectTrigger className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">info</SelectItem>
                  <SelectItem value="success">success</SelectItem>
                  <SelectItem value="warning">warning</SelectItem>
                  <SelectItem value="promo">promo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Link */}
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('admin.notifications.form.link')}
              </label>
              <Input
                placeholder={t('admin.notifications.form.linkPlaceholder')}
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </div>

            {/* Channel */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('admin.notifications.form.channel')}
              </label>
              <div className="flex flex-wrap gap-4">
                {(['app', 'email', 'both'] as Channel[]).map((ch) => (
                  <label key={ch} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="channel"
                      value={ch}
                      checked={channel === ch}
                      onChange={() => setChannel(ch)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <span className="text-sm">
                      {ch === 'app'
                        ? t('admin.notifications.form.channelApp')
                        : ch === 'email'
                        ? t('admin.notifications.form.channelEmail')
                        : t('admin.notifications.form.channelBoth')}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Validation errors */}
            {errors.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/30 px-4 py-3 space-y-1">
                {errors.map((err, i) => (
                  <p key={i} className="text-sm text-red-800 dark:text-red-200">{err}</p>
                ))}
              </div>
            )}

            {/* Send error */}
            {sendError && (
              <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/30 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                {sendError}
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="rounded-md border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/30 px-4 py-3 space-y-1">
                {result.created !== undefined && (
                  <p className="text-sm text-green-800 dark:text-green-200">
                    {t('admin.notifications.resultCreated', undefined, { count: result.created })}
                  </p>
                )}
                {result.emailsSent !== undefined && (
                  <p className="text-sm text-green-800 dark:text-green-200">
                    {t('admin.notifications.resultEmailsSent', undefined, { count: result.emailsSent })}
                  </p>
                )}
                {result.emailsFailed !== undefined && result.emailsFailed > 0 && (
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    {t('admin.notifications.resultEmailsFailed', undefined, { count: result.emailsFailed })}
                  </p>
                )}
              </div>
            )}

            {/* Send button */}
            <Button
              onClick={handleSend}
              disabled={sending}
              className="w-full"
            >
              {sending
                ? t('admin.notifications.form.sending')
                : t('admin.notifications.form.send')}
            </Button>
          </section>
        </div>
    </main>
  )
}
