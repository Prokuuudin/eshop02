'use client'

import React from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// ─── Types ────────────────────────────────────────────────────────────────────

type BannerType = 'hero' | 'promo' | 'sale' | 'info'
type BlockType = 'announcement' | 'feature' | 'promo-strip' | 'cta' | 'info'
type TextColor = 'light' | 'dark'
type CtaStyle = 'primary' | 'secondary' | 'outline'

type Banner = {
  id: string
  type: BannerType
  title: string
  subtitle: string
  image: string
  link: string
  ctaLabel: string
  ctaStyle: CtaStyle
  bgColor: string
  textColor: TextColor
  active: boolean
  order: number
  createdAt: string
  updatedAt: string
}

type ContentBlock = {
  id: string
  type: BlockType
  title: string
  subtitle: string
  content: string
  icon: string
  link: string
  linkLabel: string
  bgColor: string
  active: boolean
  order: number
  createdAt: string
  updatedAt: string
}

// ─── Empty forms ──────────────────────────────────────────────────────────────

const EMPTY_BANNER: Omit<Banner, 'id' | 'order' | 'createdAt' | 'updatedAt'> = {
  type: 'promo',
  title: '',
  subtitle: '',
  image: '',
  link: '',
  ctaLabel: '',
  ctaStyle: 'primary',
  bgColor: '#ffffff',
  textColor: 'dark',
  active: true
}

const EMPTY_BLOCK: Omit<ContentBlock, 'id' | 'order' | 'createdAt' | 'updatedAt'> = {
  type: 'feature',
  title: '',
  subtitle: '',
  content: '',
  icon: '',
  link: '',
  linkLabel: '',
  bgColor: '#ffffff',
  active: true
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const BANNER_TYPE_LABELS: Record<BannerType, string> = {
  hero: 'Главный герой',
  promo: 'Промо',
  sale: 'Скидка/Акция',
  info: 'Информационный'
}

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  announcement: 'Объявление',
  feature: 'Преимущество',
  'promo-strip': 'Промо-полоса',
  cta: 'Призыв к действию',
  info: 'Информационный'
}

const CTA_STYLE_LABELS: Record<CtaStyle, string> = {
  primary: 'Основная',
  secondary: 'Вторичная',
  outline: 'Контурная'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminBannersPage() {
  const [banners, setBanners] = React.useState<Banner[]>([])
  const [blocks, setBlocks] = React.useState<ContentBlock[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState<{ text: string; error?: boolean } | null>(null)

  // Banner form state
  const [bannerForm, setBannerForm] = React.useState<Omit<Banner, 'id' | 'order' | 'createdAt' | 'updatedAt'>>(EMPTY_BANNER)
  const [editingBannerId, setEditingBannerId] = React.useState<string | null>(null)
  const [showBannerForm, setShowBannerForm] = React.useState(false)

  // Block form state
  const [blockForm, setBlockForm] = React.useState<Omit<ContentBlock, 'id' | 'order' | 'createdAt' | 'updatedAt'>>(EMPTY_BLOCK)
  const [editingBlockId, setEditingBlockId] = React.useState<string | null>(null)
  const [showBlockForm, setShowBlockForm] = React.useState(false)

  // Image upload state
  const [uploadingBannerImage, setUploadingBannerImage] = React.useState(false)

  const showMsg = (text: string, error = false) => {
    setMessage({ text, error })
    setTimeout(() => setMessage(null), 3000)
  }

  // ── Load data ────────────────────────────────────────────────────────────────

  const loadData = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/banners', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { banners: Banner[]; blocks: ContentBlock[] }
      setBanners(data.banners.sort((a, b) => a.order - b.order))
      setBlocks(data.blocks.sort((a, b) => a.order - b.order))
    } catch {
      showMsg('Не удалось загрузить данные.', true)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void loadData() }, [loadData])

  // ── Image upload ─────────────────────────────────────────────────────────────

  const uploadImage = async (file: File): Promise<string | null> => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/admin/content/upload', { method: 'POST', body: formData })
    if (!res.ok) return null
    const data = (await res.json()) as { path?: string }
    return data.path ?? null
  }

  const onBannerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingBannerImage(true)
    const path = await uploadImage(file)
    if (path) {
      setBannerForm((f) => ({ ...f, image: path }))
      showMsg('Изображение загружено.')
    } else {
      showMsg('Не удалось загрузить изображение.', true)
    }
    setUploadingBannerImage(false)
    e.target.value = ''
  }

  // ── Banner CRUD ───────────────────────────────────────────────────────────────

  const onSaveBanner = async () => {
    if (!bannerForm.title.trim()) { showMsg('Укажите заголовок баннера.', true); return }
    setSaving(true)
    try {
      if (editingBannerId) {
        const res = await fetch(`/api/admin/banners/${editingBannerId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'banner', item: bannerForm })
        })
        if (!res.ok) throw new Error()
        showMsg('Баннер сохранен.')
      } else {
        const res = await fetch('/api/admin/banners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'banner', item: bannerForm })
        })
        if (!res.ok) throw new Error()
        showMsg('Баннер создан.')
      }
      resetBannerForm()
      await loadData()
    } catch {
      showMsg('Не удалось сохранить баннер.', true)
    } finally {
      setSaving(false)
    }
  }

  const onDeleteBanner = async (id: string) => {
    if (!confirm('Удалить баннер?')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/banners/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'banner' })
      })
      if (!res.ok) throw new Error()
      showMsg('Баннер удален.')
      await loadData()
    } catch {
      showMsg('Не удалось удалить баннер.', true)
    } finally {
      setSaving(false)
    }
  }

  const onToggleBanner = async (banner: Banner) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/banners/${banner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'banner', item: { active: !banner.active } })
      })
      if (!res.ok) throw new Error()
      await loadData()
    } catch {
      showMsg('Не удалось изменить статус.', true)
    } finally {
      setSaving(false)
    }
  }

  const onMoveBanner = async (id: string, dir: 'up' | 'down') => {
    const sorted = [...banners]
    const idx = sorted.findIndex((b) => b.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return

    const updatedA = { ...sorted[idx], order: sorted[swapIdx].order }
    const updatedB = { ...sorted[swapIdx], order: sorted[idx].order }

    setSaving(true)
    try {
      await Promise.all([
        fetch(`/api/admin/banners/${updatedA.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'banner', item: { order: updatedA.order } })
        }),
        fetch(`/api/admin/banners/${updatedB.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'banner', item: { order: updatedB.order } })
        })
      ])
      await loadData()
    } catch {
      showMsg('Не удалось изменить порядок.', true)
    } finally {
      setSaving(false)
    }
  }

  const onEditBanner = (banner: Banner) => {
    setEditingBannerId(banner.id)
    setBannerForm({
      type: banner.type,
      title: banner.title,
      subtitle: banner.subtitle,
      image: banner.image,
      link: banner.link,
      ctaLabel: banner.ctaLabel,
      ctaStyle: banner.ctaStyle,
      bgColor: banner.bgColor,
      textColor: banner.textColor,
      active: banner.active
    })
    setShowBannerForm(true)
  }

  const resetBannerForm = () => {
    setEditingBannerId(null)
    setBannerForm(EMPTY_BANNER)
    setShowBannerForm(false)
  }

  // ── Block CRUD ────────────────────────────────────────────────────────────────

  const onSaveBlock = async () => {
    if (!blockForm.title.trim()) { showMsg('Укажите заголовок блока.', true); return }
    setSaving(true)
    try {
      if (editingBlockId) {
        const res = await fetch(`/api/admin/banners/${editingBlockId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'block', item: blockForm })
        })
        if (!res.ok) throw new Error()
        showMsg('Блок сохранен.')
      } else {
        const res = await fetch('/api/admin/banners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'block', item: blockForm })
        })
        if (!res.ok) throw new Error()
        showMsg('Блок создан.')
      }
      resetBlockForm()
      await loadData()
    } catch {
      showMsg('Не удалось сохранить блок.', true)
    } finally {
      setSaving(false)
    }
  }

  const onDeleteBlock = async (id: string) => {
    if (!confirm('Удалить блок?')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/banners/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'block' })
      })
      if (!res.ok) throw new Error()
      showMsg('Блок удален.')
      await loadData()
    } catch {
      showMsg('Не удалось удалить блок.', true)
    } finally {
      setSaving(false)
    }
  }

  const onToggleBlock = async (block: ContentBlock) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/banners/${block.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'block', item: { active: !block.active } })
      })
      if (!res.ok) throw new Error()
      await loadData()
    } catch {
      showMsg('Не удалось изменить статус.', true)
    } finally {
      setSaving(false)
    }
  }

  const onMoveBlock = async (id: string, dir: 'up' | 'down') => {
    const sorted = [...blocks]
    const idx = sorted.findIndex((b) => b.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return

    const updatedA = { ...sorted[idx], order: sorted[swapIdx].order }
    const updatedB = { ...sorted[swapIdx], order: sorted[idx].order }

    setSaving(true)
    try {
      await Promise.all([
        fetch(`/api/admin/banners/${updatedA.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'block', item: { order: updatedA.order } })
        }),
        fetch(`/api/admin/banners/${updatedB.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'block', item: { order: updatedB.order } })
        })
      ])
      await loadData()
    } catch {
      showMsg('Не удалось изменить порядок.', true)
    } finally {
      setSaving(false)
    }
  }

  const onEditBlock = (block: ContentBlock) => {
    setEditingBlockId(block.id)
    setBlockForm({
      type: block.type,
      title: block.title,
      subtitle: block.subtitle,
      content: block.content,
      icon: block.icon,
      link: block.link,
      linkLabel: block.linkLabel,
      bgColor: block.bgColor,
      active: block.active
    })
    setShowBlockForm(true)
  }

  const resetBlockForm = () => {
    setEditingBlockId(null)
    setBlockForm(EMPTY_BLOCK)
    setShowBlockForm(false)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Баннеры и блоки
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Управление промо-баннерами и контентными блоками главной страницы.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/content">
              <Button variant="outline">← Контент</Button>
            </Link>
            <Link href="/admin">
              <Button variant="outline">Назад в админку</Button>
            </Link>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`rounded-md border px-3 py-2 text-sm ${
            message.error
              ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
              : 'border-green-300 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
          }`}>
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Загрузка...
          </div>
        ) : (
          <Tabs defaultValue="banners">
            <TabsList>
              <TabsTrigger value="banners">Баннеры ({banners.length})</TabsTrigger>
              <TabsTrigger value="blocks">Контентные блоки ({blocks.length})</TabsTrigger>
            </TabsList>

            {/* ══════════════════════ BANNERS TAB ══════════════════════ */}
            <TabsContent value="banners" className="space-y-4 mt-4">
              <div className="flex justify-end">
                <Button onClick={() => { resetBannerForm(); setShowBannerForm(true) }} disabled={saving}>
                  + Добавить баннер
                </Button>
              </div>

              {/* Banner form */}
              {showBannerForm && (
                <div className="rounded-lg border border-indigo-200 dark:border-indigo-700 bg-card p-5 space-y-4">
                  <h2 className="text-base font-semibold text-foreground">
                    {editingBannerId ? 'Редактировать баннер' : 'Новый баннер'}
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Тип</label>
                      <select
                        value={bannerForm.type}
                        onChange={(e) => setBannerForm((f) => ({ ...f, type: e.target.value as BannerType }))}
                        className="w-full rounded-md border border-border bg-white dark:bg-gray-800 text-foreground px-3 py-2 text-sm"
                      >
                        {(Object.keys(BANNER_TYPE_LABELS) as BannerType[]).map((t) => (
                          <option key={t} value={t}>{BANNER_TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Заголовок *</label>
                      <Input
                        value={bannerForm.title}
                        onChange={(e) => setBannerForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="Заголовок баннера"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs text-muted-foreground">Подзаголовок</label>
                      <Input
                        value={bannerForm.subtitle}
                        onChange={(e) => setBannerForm((f) => ({ ...f, subtitle: e.target.value }))}
                        placeholder="Короткий текст под заголовком"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Изображение (src)</label>
                      <Input
                        value={bannerForm.image}
                        onChange={(e) => setBannerForm((f) => ({ ...f, image: e.target.value }))}
                        placeholder="/uploads/banner.jpg"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Загрузить изображение</label>
                      <Input
                        type="file"
                        accept="image/*"
                        disabled={uploadingBannerImage || saving}
                        onChange={onBannerImageUpload}
                      />
                    </div>

                    {bannerForm.image && (
                      <div className="sm:col-span-2">
                        <img
                          src={bannerForm.image}
                          alt="Превью баннера"
                          className="h-32 w-full rounded-md border border-border object-cover bg-gray-50 dark:bg-gray-800"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Ссылка (href)</label>
                      <Input
                        value={bannerForm.link}
                        onChange={(e) => setBannerForm((f) => ({ ...f, link: e.target.value }))}
                        placeholder="/catalog или https://..."
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Текст кнопки CTA</label>
                      <Input
                        value={bannerForm.ctaLabel}
                        onChange={(e) => setBannerForm((f) => ({ ...f, ctaLabel: e.target.value }))}
                        placeholder="Смотреть каталог"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Стиль кнопки</label>
                      <select
                        value={bannerForm.ctaStyle}
                        onChange={(e) => setBannerForm((f) => ({ ...f, ctaStyle: e.target.value as CtaStyle }))}
                        className="w-full rounded-md border border-border bg-white dark:bg-gray-800 text-foreground px-3 py-2 text-sm"
                      >
                        {(Object.keys(CTA_STYLE_LABELS) as CtaStyle[]).map((s) => (
                          <option key={s} value={s}>{CTA_STYLE_LABELS[s]}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Цвет текста</label>
                      <select
                        value={bannerForm.textColor}
                        onChange={(e) => setBannerForm((f) => ({ ...f, textColor: e.target.value as TextColor }))}
                        className="w-full rounded-md border border-border bg-white dark:bg-gray-800 text-foreground px-3 py-2 text-sm"
                      >
                        <option value="dark">Тёмный</option>
                        <option value="light">Светлый</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Цвет фона</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={bannerForm.bgColor}
                          onChange={(e) => setBannerForm((f) => ({ ...f, bgColor: e.target.value }))}
                          className="h-9 w-14 rounded border border-border cursor-pointer"
                        />
                        <Input
                          value={bannerForm.bgColor}
                          onChange={(e) => setBannerForm((f) => ({ ...f, bgColor: e.target.value }))}
                          placeholder="#ffffff"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Активен</label>
                      <select
                        value={bannerForm.active ? 'yes' : 'no'}
                        onChange={(e) => setBannerForm((f) => ({ ...f, active: e.target.value === 'yes' }))}
                        className="w-full rounded-md border border-border bg-white dark:bg-gray-800 text-foreground px-3 py-2 text-sm"
                      >
                        <option value="yes">Да — отображается на сайте</option>
                        <option value="no">Нет — скрыт</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button onClick={onSaveBanner} disabled={saving}>
                      {editingBannerId ? 'Сохранить изменения' : 'Создать баннер'}
                    </Button>
                    <Button variant="outline" onClick={resetBannerForm} disabled={saving}>
                      Отмена
                    </Button>
                  </div>
                </div>
              )}

              {/* Banner list */}
              {banners.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Баннеров пока нет. Нажмите «+ Добавить баннер», чтобы создать первый.
                </div>
              ) : (
                <div className="space-y-3">
                  {banners.map((banner, idx) => (
                    <div
                      key={banner.id}
                      className={`rounded-lg border bg-card p-4 flex gap-3 items-start transition-opacity ${
                        banner.active
                          ? 'border-border'
                          : 'border-border opacity-50'
                      }`}
                    >
                      {/* Preview thumbnail */}
                      {banner.image ? (
                        <img
                          src={banner.image}
                          alt={banner.title}
                          className="h-16 w-24 rounded object-cover bg-muted flex-shrink-0"
                        />
                      ) : (
                        <div
                          className="h-16 w-24 rounded flex-shrink-0 flex items-center justify-center text-xs text-gray-400"
                          style={{ backgroundColor: banner.bgColor }}
                        >
                          Нет фото
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {banner.title}
                          </span>
                          <span className="text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                            {BANNER_TYPE_LABELS[banner.type]}
                          </span>
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                            banner.active
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-muted text-gray-500'
                          }`}>
                            {banner.active ? 'Активен' : 'Скрыт'}
                          </span>
                        </div>
                        {banner.subtitle && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{banner.subtitle}</p>
                        )}
                        {banner.link && (
                          <p className="text-xs text-indigo-500 mt-0.5 truncate">{banner.link}</p>
                        )}
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="outline" size="sm"
                          disabled={idx === 0 || saving}
                          onClick={() => void onMoveBanner(banner.id, 'up')}
                          title="Выше"
                        >▲</Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={idx === banners.length - 1 || saving}
                          onClick={() => void onMoveBanner(banner.id, 'down')}
                          title="Ниже"
                        >▼</Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={saving}
                          onClick={() => void onToggleBanner(banner)}
                          title={banner.active ? 'Скрыть' : 'Показать'}
                        >
                          {banner.active ? 'Скрыть' : 'Показать'}
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={saving}
                          onClick={() => onEditBanner(banner)}
                        >
                          Изменить
                        </Button>
                        <Button
                          variant="destructive" size="sm"
                          disabled={saving}
                          onClick={() => void onDeleteBanner(banner.id)}
                        >
                          Удалить
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ══════════════════════ BLOCKS TAB ══════════════════════ */}
            <TabsContent value="blocks" className="space-y-4 mt-4">
              <div className="flex justify-end">
                <Button onClick={() => { resetBlockForm(); setShowBlockForm(true) }} disabled={saving}>
                  + Добавить блок
                </Button>
              </div>

              {/* Block form */}
              {showBlockForm && (
                <div className="rounded-lg border border-indigo-200 dark:border-indigo-700 bg-card p-5 space-y-4">
                  <h2 className="text-base font-semibold text-foreground">
                    {editingBlockId ? 'Редактировать блок' : 'Новый контентный блок'}
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Тип блока</label>
                      <select
                        value={blockForm.type}
                        onChange={(e) => setBlockForm((f) => ({ ...f, type: e.target.value as BlockType }))}
                        className="w-full rounded-md border border-border bg-white dark:bg-gray-800 text-foreground px-3 py-2 text-sm"
                      >
                        {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((t) => (
                          <option key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Заголовок *</label>
                      <Input
                        value={blockForm.title}
                        onChange={(e) => setBlockForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="Заголовок блока"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs text-muted-foreground">Подзаголовок</label>
                      <Input
                        value={blockForm.subtitle}
                        onChange={(e) => setBlockForm((f) => ({ ...f, subtitle: e.target.value }))}
                        placeholder="Краткое описание"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs text-muted-foreground">Текст / HTML-контент</label>
                      <Textarea
                        value={blockForm.content}
                        onChange={(e) => setBlockForm((f) => ({ ...f, content: e.target.value }))}
                        placeholder="Основной текст блока..."
                        className="min-h-[100px]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Иконка (emoji или путь)</label>
                      <Input
                        value={blockForm.icon}
                        onChange={(e) => setBlockForm((f) => ({ ...f, icon: e.target.value }))}
                        placeholder="✨ или /icons/star.svg"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Цвет фона</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={blockForm.bgColor}
                          onChange={(e) => setBlockForm((f) => ({ ...f, bgColor: e.target.value }))}
                          className="h-9 w-14 rounded border border-border cursor-pointer"
                        />
                        <Input
                          value={blockForm.bgColor}
                          onChange={(e) => setBlockForm((f) => ({ ...f, bgColor: e.target.value }))}
                          placeholder="#ffffff"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Ссылка (href)</label>
                      <Input
                        value={blockForm.link}
                        onChange={(e) => setBlockForm((f) => ({ ...f, link: e.target.value }))}
                        placeholder="/catalog"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Текст ссылки</label>
                      <Input
                        value={blockForm.linkLabel}
                        onChange={(e) => setBlockForm((f) => ({ ...f, linkLabel: e.target.value }))}
                        placeholder="Подробнее"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Активен</label>
                      <select
                        value={blockForm.active ? 'yes' : 'no'}
                        onChange={(e) => setBlockForm((f) => ({ ...f, active: e.target.value === 'yes' }))}
                        className="w-full rounded-md border border-border bg-white dark:bg-gray-800 text-foreground px-3 py-2 text-sm"
                      >
                        <option value="yes">Да — отображается на сайте</option>
                        <option value="no">Нет — скрыт</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button onClick={onSaveBlock} disabled={saving}>
                      {editingBlockId ? 'Сохранить изменения' : 'Создать блок'}
                    </Button>
                    <Button variant="outline" onClick={resetBlockForm} disabled={saving}>
                      Отмена
                    </Button>
                  </div>
                </div>
              )}

              {/* Blocks list */}
              {blocks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Блоков пока нет. Нажмите «+ Добавить блок», чтобы создать первый.
                </div>
              ) : (
                <div className="space-y-3">
                  {blocks.map((block, idx) => (
                    <div
                      key={block.id}
                      className={`rounded-lg border bg-card p-4 flex gap-3 items-start transition-opacity ${
                        block.active
                          ? 'border-border'
                          : 'border-border opacity-50'
                      }`}
                    >
                      {/* Color swatch + icon */}
                      <div
                        className="h-12 w-12 rounded flex-shrink-0 flex items-center justify-center text-xl border border-border"
                        style={{ backgroundColor: block.bgColor }}
                      >
                        {block.icon || '▪'}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {block.title}
                          </span>
                          <span className="text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                            {BLOCK_TYPE_LABELS[block.type]}
                          </span>
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                            block.active
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-muted text-gray-500'
                          }`}>
                            {block.active ? 'Активен' : 'Скрыт'}
                          </span>
                        </div>
                        {block.subtitle && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{block.subtitle}</p>
                        )}
                        {block.content && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{block.content}</p>
                        )}
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="outline" size="sm"
                          disabled={idx === 0 || saving}
                          onClick={() => void onMoveBlock(block.id, 'up')}
                          title="Выше"
                        >▲</Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={idx === blocks.length - 1 || saving}
                          onClick={() => void onMoveBlock(block.id, 'down')}
                          title="Ниже"
                        >▼</Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={saving}
                          onClick={() => void onToggleBlock(block)}
                        >
                          {block.active ? 'Скрыть' : 'Показать'}
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={saving}
                          onClick={() => onEditBlock(block)}
                        >
                          Изменить
                        </Button>
                        <Button
                          variant="destructive" size="sm"
                          disabled={saving}
                          onClick={() => void onDeleteBlock(block.id)}
                        >
                          Удалить
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>
    </AdminGate>
  )
}
