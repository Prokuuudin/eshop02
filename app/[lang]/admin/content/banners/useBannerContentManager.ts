import React from 'react'
import { resolveLocaleText } from '@/lib/locale-text'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'
import {
  EMPTY_BANNER,
  type Banner,
  type BannerForm,
} from './banner-model'

function useBannerContentManagerState() {
  const confirmAction = useAdminConfirm()
  const [banners, setBanners] = React.useState<Banner[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState<{ text: string; error?: boolean } | null>(null)

  // Banner form state
  const [bannerForm, setBannerForm] = React.useState<BannerForm>(EMPTY_BANNER)
  const [editingBannerId, setEditingBannerId] = React.useState<string | null>(null)
  const [showBannerForm, setShowBannerForm] = React.useState(false)

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
      const data = (await res.json()) as { banners: Banner[] }
      setBanners(data.banners.sort((a, b) => a.order - b.order))
    } catch {
      showMsg('Не удалось загрузить данные.', true)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void loadData()
    })
    return () => {
      cancelled = true
    }
  }, [loadData])

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
    if (!resolveLocaleText(bannerForm.title, 'ru').trim()) { showMsg('Укажите заголовок баннера.', true); return }
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
    const decision = await confirmAction({ title: 'Удалить баннер?', description: 'Баннер перестанет отображаться на сайте.', affected: [id], requireReason: true, destructive: true })
    if (!decision.confirmed) return
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
      const responses = await Promise.all([
        fetch(`/api/admin/banners/${updatedA.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'banner', item: { order: updatedA.order } })
        }),
        fetch(`/api/admin/banners/${updatedB.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'banner', item: { order: updatedB.order } })
        })
      ])
      if (responses.some((response) => !response.ok)) throw new Error()
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

  return {
    banners, loading, saving, message,
    bannerForm, setBannerForm, editingBannerId, showBannerForm, setShowBannerForm,
    uploadingBannerImage, onBannerImageUpload,
    onSaveBanner, onDeleteBanner, onToggleBanner, onMoveBanner, onEditBanner, resetBannerForm,
  }
}

export function useBannerContentManager(): ReturnType<typeof useBannerContentManagerState> {
  return useBannerContentManagerState()
}
