'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useTranslation } from '@/lib/use-translation'
import { reportAdminError } from '@/lib/admin-ui-errors'
import { useAdminLocale } from '@/lib/use-admin-locale'
import { Info, ShieldCheck } from 'lucide-react'

type DbUser = {
  id: string
  email: string
  name: string | null
  phone: string | null
  cardNumber: string | null
}

type NotificationType = 'info' | 'success' | 'warning' | 'promo'
type Channel = 'app' | 'email' | 'both'
type UploadedAsset = { path: string; name: string; size: number; mimeType: string }

type SendResult = {
  selected?: number
  appDelivered?: number
  emailsSent?: number
  emailsFailed?: number
  preferencesSkipped?: number
  marketingConsentSkipped?: number
  invalidEmailSkipped?: number
  ineligibleSkipped?: number
}

export default function AdminNotificationsSendPage(): React.ReactElement {
  const { t } = useTranslation()
  const { l } = useAdminLocale()

  // Users state
  const [users, setUsers] = useState<DbUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Form state
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState<NotificationType>('info')
  const [link, setLink] = useState('')
  const [channel, setChannel] = useState<Channel>('app')
  const [image, setImage] = useState<UploadedAsset | null>(null)
  const [attachments, setAttachments] = useState<UploadedAsset[]>([])
  const [uploading, setUploading] = useState(false)

  // Send state
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [sendError, setSendError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
    setUsersLoading(true)
    const params = new URLSearchParams({ take: '50', skip: String(page * 50) })
    if (search.trim()) params.set('search', search.trim())
    fetch(`/api/admin/notifications/recipients?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load users')
        return res.json()
      })
      .then((data) => {
        if (Array.isArray(data.users)) {
          setUsers(data.users)
          setTotal(typeof data.total === 'number' ? data.total : data.users.length)
        }
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          reportAdminError(error, l('Получатели рассылки', 'Broadcast recipients', 'Izsūtnes saņēmēji'))
        }
      })
      .finally(() => {
        setUsersLoading(false)
      })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [l, page, search])

  const allFilteredSelected =
    users.length > 0 && users.every((u) => selectedIds.has(u.id))

  const toggleUser = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size < 500) next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      users.forEach((u) => { if (next.size < 500) next.add(u.id) })
      return next
    })
  }

  const deselectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      users.forEach((u) => next.delete(u.id))
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
    if (title.trim().length > 150) errs.push('Title: maximum 150 characters')
    if (message.trim().length > 5000) errs.push('Message: maximum 5000 characters')
    if (link.trim() && !/^\/(?!\/)/u.test(link.trim())) errs.push('Only an internal path beginning with / is allowed')
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
          imageUrl: image?.path,
          attachments: attachments.map(({ path, name }) => ({ path, name })),
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

  const uploadAsset = async (file: File, kind: 'image' | 'attachment'): Promise<UploadedAsset> => {
    const form = new FormData()
    form.set('file', file)
    form.set('kind', kind)
    const response = await fetch('/api/admin/notifications/assets', { method: 'POST', body: form })
    const data = await response.json() as UploadedAsset & { error?: string }
    if (!response.ok) throw new Error(data.error ?? 'upload_failed')
    return data
  }

  const handleImageUpload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true); setSendError('')
    try { setImage(await uploadAsset(file, 'image')) } catch (error) { setSendError(error instanceof Error ? error.message : 'upload_failed') } finally { setUploading(false) }
  }

  const handleAttachmentUpload = async (files: FileList | null) => {
    if (!files?.length) return
    if (attachments.length + files.length > 3) { setSendError('Maximum 3 attachments'); return }
    setUploading(true); setSendError('')
    try {
      const uploaded: UploadedAsset[] = []
      for (const file of Array.from(files)) uploaded.push(await uploadAsset(file, 'attachment'))
      setAttachments((current) => [...current, ...uploaded])
    } catch (error) { setSendError(error instanceof Error ? error.message : 'upload_failed') } finally { setUploading(false) }
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

        <section className="overflow-hidden rounded-xl border border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/25" aria-labelledby="notification-help-title">
          <div className="flex items-start gap-3 border-b border-sky-200 px-4 py-3 dark:border-sky-900">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" />
            <div>
              <h2 id="notification-help-title" className="font-semibold text-sky-950 dark:text-sky-100">
                {l('Как отправить уведомление', 'How to send a notification', 'Kā nosūtīt paziņojumu')}
              </h2>
              <p className="mt-0.5 text-xs text-sky-800/80 dark:text-sky-200/80">
                {l('Проверьте получателей и содержимое перед отправкой — отменить уже отправленное сообщение нельзя.', 'Review recipients and content before sending — a sent message cannot be recalled.', 'Pirms nosūtīšanas pārbaudiet saņēmējus un saturu — nosūtītu ziņu atsaukt nevar.')}
              </p>
            </div>
          </div>
          <div className="grid gap-4 px-4 py-4 text-sm text-sky-950 dark:text-sky-100 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="font-semibold">1. {l('Выберите клиентов', 'Select clients', 'Izvēlieties klientus')}</p>
              <p className="mt-1 text-xs leading-relaxed text-sky-800/80 dark:text-sky-200/75">
                {l('Используйте поиск и страницы. Выбор сохраняется; максимум 500 получателей.', 'Use search and pagination. Selection is preserved; maximum 500 recipients.', 'Izmantojiet meklēšanu un lapas. Izvēle saglabājas; ne vairāk kā 500 saņēmēju.')}
              </p>
            </div>
            <div>
              <p className="font-semibold">2. {l('Подготовьте сообщение', 'Prepare the message', 'Sagatavojiet ziņu')}</p>
              <p className="mt-1 text-xs leading-relaxed text-sky-800/80 dark:text-sky-200/75">
                {l('Заголовок — до 150, текст — до 5000 символов. Ссылка должна начинаться с /.', 'Title: up to 150; message: up to 5,000 characters. Links must start with /.', 'Virsraksts līdz 150, teksts līdz 5000 rakstzīmēm. Saitei jāsākas ar /.')}
              </p>
            </div>
            <div>
              <p className="font-semibold">3. {l('Добавьте оформление', 'Add media', 'Pievienojiet noformējumu')}</p>
              <p className="mt-1 text-xs leading-relaxed text-sky-800/80 dark:text-sky-200/75">
                {l('Можно загрузить 1 изображение до 5 MB и до 3 вложений по 10 MB (всего до 20 MB).', 'Upload 1 image up to 5 MB and up to 3 attachments of 10 MB each (20 MB total).', 'Var augšupielādēt 1 attēlu līdz 5 MB un līdz 3 pielikumiem pa 10 MB (kopā 20 MB).')}
              </p>
            </div>
            <div>
              <p className="font-semibold">4. {l('Выберите доставку', 'Choose delivery', 'Izvēlieties piegādi')}</p>
              <p className="mt-1 text-xs leading-relaxed text-sky-800/80 dark:text-sky-200/75">
                {l('App — кабинет, Email — письмо, Both — оба канала. После отправки проверьте отчёт.', 'App — account, Email — email, Both — both channels. Review the report after sending.', 'App — konts, Email — e-pasts, Both — abi kanāli. Pēc nosūtīšanas pārbaudiet pārskatu.')}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 bg-sky-100/70 px-4 py-2.5 text-xs text-sky-900 dark:bg-sky-900/30 dark:text-sky-100">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {l('Важно: для типа promo система автоматически проверяет marketing consent. Отписанные клиенты, администраторы и служебные аккаунты будут пропущены.', 'Important: promo automatically requires marketing consent. Unsubscribed clients, administrators and service accounts are skipped.', 'Svarīgi: promo tipam sistēma automātiski pārbauda mārketinga piekrišanu. Atrakstījušies klienti, administratori un dienesta konti tiek izlaisti.')}
            </p>
          </div>
        </section>

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
                onChange={(e) => { setSearch(e.target.value); setPage(0) }}
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
                    {t('admin.notifications.form.selectedCount', undefined, { count: selectedIds.size })} / 500
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
              ) : users.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  {t('admin.notifications.form.noUsers')}
                </p>
              ) : (
                users.map((u) => (
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
                      {(u.phone || u.cardNumber) && <p className="text-xs text-muted-foreground truncate">{[u.phone, u.cardNumber].filter(Boolean).join(' · ')}</p>}
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <Button variant="outline" size="sm" disabled={page === 0 || usersLoading} onClick={() => setPage((p) => p - 1)}>←</Button>
              <span>{page + 1} / {Math.max(1, Math.ceil(total / 50))} · {total}</span>
              <Button variant="outline" size="sm" disabled={(page + 1) * 50 >= total || usersLoading} onClick={() => setPage((p) => p + 1)}>→</Button>
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
                maxLength={150}
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">{title.length} / 150</p>
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
                maxLength={5000}
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">{message.length} / 5000</p>
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
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">{l('Праздничное изображение', 'Greeting image', 'Apsveikuma attēls')}</p>
                <p className="text-xs text-muted-foreground">JPG, PNG, WebP, GIF или AVIF · до 5 MB</p>
              </div>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={uploading} onChange={(event) => void handleImageUpload(event.target.files?.[0])} className="block w-full text-xs" />
              {image && <div className="relative overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of dynamically uploaded media */}
                <img src={image.path} alt="" className="max-h-52 w-full object-cover" />
                <button type="button" onClick={() => setImage(null)} className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-white">×</button>
              </div>}
              <div>
                <p className="text-sm font-medium">{l('Вложения', 'Attachments', 'Pielikumi')} ({attachments.length}/3)</p>
                <p className="text-xs text-muted-foreground">PDF или изображения · до 10 MB каждый, до 20 MB суммарно</p>
              </div>
              <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={uploading || attachments.length >= 3} onChange={(event) => void handleAttachmentUpload(event.target.files)} className="block w-full text-xs" />
              {attachments.map((file) => <div key={file.path} className="flex items-center justify-between gap-2 rounded bg-muted px-2 py-1 text-xs"><span className="truncate">📎 {file.name}</span><button type="button" onClick={() => setAttachments((items) => items.filter((item) => item.path !== file.path))}>×</button></div>)}
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
                {result.selected !== undefined && (
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Selected: {result.selected}; app delivered: {result.appDelivered ?? 0}
                  </p>
                )}
                <p className="text-sm text-yellow-800 dark:text-yellow-200">Skipped by preferences: {result.preferencesSkipped ?? 0}; promo consent: {result.marketingConsentSkipped ?? 0}; invalid email: {result.invalidEmailSkipped ?? 0}; ineligible: {result.ineligibleSkipped ?? 0}</p>
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
              disabled={sending || uploading || selectedIds.size === 0 || selectedIds.size > 500}
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
