import React from 'react'
import { resolveLocaleText } from '@/lib/locale-text'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'
import { useAdminLocale } from '@/lib/use-admin-locale'
import { BANNER_IMAGE_MAX_BYTES, BANNER_VIDEO_MAX_BYTES } from '@/lib/banner-media'
import {
  EMPTY_BANNER,
  type Banner,
  type BannerForm,
} from './banner-model'

function useBannerContentManagerState() {
  const confirmAction = useAdminConfirm()
  const { l } = useAdminLocale()
  const [banners, setBanners] = React.useState<Banner[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState<{ text: string; error?: boolean } | null>(null)

  // Banner form state
  const [bannerForm, setBannerForm] = React.useState<BannerForm>(EMPTY_BANNER)
  const [editingBannerId, setEditingBannerId] = React.useState<string | null>(null)
  const [showBannerForm, setShowBannerForm] = React.useState(false)

  // Media upload state
  const [uploadingBannerMedia, setUploadingBannerMedia] = React.useState(false)

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
      showMsg(l('Не удалось загрузить данные.', 'Failed to load data.', 'Neizdevās ielādēt datus.'), true)
    } finally {
      setLoading(false)
    }
  }, [l])

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

  const uploadMedia = async (file: File): Promise<{ path: string; mimeType: string } | null> => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/admin/content/upload', { method: 'POST', body: formData })
    if (!res.ok) return null
    const data = (await res.json()) as { path?: string; mimeType?: string }
    return data.path && data.mimeType ? { path: data.path, mimeType: data.mimeType } : null
  }

  const onBannerMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const input = e.target
    const isVideo = file.type.startsWith('video/')
    if (file.size > (isVideo ? BANNER_VIDEO_MAX_BYTES : BANNER_IMAGE_MAX_BYTES)) {
      showMsg(l('Файл слишком большой: фото — до 10 МБ, видео — до 50 МБ.', 'File too large: photos up to 10 MB, videos up to 50 MB.', 'Fails ir pārāk liels: foto līdz 10 MB, video līdz 50 MB.'), true)
      input.value = ''
      return
    }
    setUploadingBannerMedia(true)
    try {
      const media = await uploadMedia(file)
      if (!media) throw new Error()
      setBannerForm((f) => ({ ...f, image: media.path, type: media.mimeType.startsWith('video/') ? 'video' : f.type === 'video' ? 'image' : f.type }))
      showMsg(l('Файл загружен. Сохраните баннер для публикации.', 'File uploaded. Save the banner to publish it.', 'Fails augšupielādēts. Saglabājiet baneri, lai to publicētu.'))
    } catch {
      showMsg(l('Не удалось загрузить файл. Фото: JPG, PNG, WebP, GIF, AVIF до 10 МБ. Видео: MP4 или WebM до 50 МБ.', 'Upload failed. Photos: JPG, PNG, WebP, GIF, AVIF up to 10 MB. Videos: MP4 or WebM up to 50 MB.', 'Augšupielāde neizdevās. Foto: JPG, PNG, WebP, GIF, AVIF līdz 10 MB. Video: MP4 vai WebM līdz 50 MB.'), true)
    } finally {
      setUploadingBannerMedia(false)
      input.value = ''
    }
  }

  // ── Banner CRUD ───────────────────────────────────────────────────────────────

  const onSaveBanner = async () => {
    if (uploadingBannerMedia || saving) return
    if (bannerForm.type !== 'sale' && !bannerForm.image.trim()) { showMsg(l('Загрузите фото или видео для баннера.', 'Upload a photo or video for the banner.', 'Augšupielādējiet banera foto vai video.'), true); return }
    if (bannerForm.type === 'sale' && !resolveLocaleText(bannerForm.title, 'ru').trim()) { showMsg(l('Укажите заголовок баннера.', 'Enter a banner title.', 'Norādiet banera virsrakstu.'), true); return }
    setSaving(true)
    try {
      if (editingBannerId) {
        const res = await fetch(`/api/admin/banners/${editingBannerId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'banner', item: bannerForm })
        })
        if (!res.ok) throw new Error()
        showMsg(l('Баннер сохранён.', 'Banner saved.', 'Baneris saglabāts.'))
      } else {
        const res = await fetch('/api/admin/banners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'banner', item: bannerForm })
        })
        if (!res.ok) throw new Error()
        showMsg(l('Баннер создан.', 'Banner created.', 'Baneris izveidots.'))
      }
      resetBannerForm()
      await loadData()
    } catch {
      showMsg(l('Не удалось сохранить баннер.', 'Failed to save banner.', 'Neizdevās saglabāt baneri.'), true)
    } finally {
      setSaving(false)
    }
  }

  const onDeleteBanner = async (id: string) => {
    const decision = await confirmAction({ title: l('Удалить баннер?', 'Delete banner?', 'Dzēst baneri?'), description: l('Баннер перестанет отображаться на сайте.', 'The banner will no longer appear on the site.', 'Baneris vietnē vairs netiks rādīts.'), affected: [id], requireReason: true, destructive: true })
    if (!decision.confirmed) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/banners/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'banner' })
      })
      if (!res.ok) throw new Error()
      showMsg(l('Баннер удалён.', 'Banner deleted.', 'Baneris dzēsts.'))
      await loadData()
    } catch {
      showMsg(l('Не удалось удалить баннер.', 'Failed to delete banner.', 'Neizdevās dzēst baneri.'), true)
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
      showMsg(l('Не удалось изменить статус.', 'Failed to change status.', 'Neizdevās mainīt statusu.'), true)
    } finally {
      setSaving(false)
    }
  }

  const onMoveBanner = async (id: string, dir: 'up' | 'down') => {
    if (saving) return
    const sorted = [...banners]
    const idx = sorted.findIndex((b) => b.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return

    setSaving(true)
    try {
      const response = await fetch('/api/admin/banners/reorder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, direction: dir }),
      })
      if (!response.ok) throw new Error()
      await loadData()
      showMsg(l('Порядок баннеров сохранён.', 'Banner order saved.', 'Baneru secība saglabāta.'))
    } catch {
      showMsg(l('Не удалось изменить порядок.', 'Failed to change order.', 'Neizdevās mainīt secību.'), true)
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
    uploadingBannerMedia, onBannerMediaUpload,
    onSaveBanner, onDeleteBanner, onToggleBanner, onMoveBanner, onEditBanner, resetBannerForm,
  }
}

export function useBannerContentManager(): ReturnType<typeof useBannerContentManagerState> {
  return useBannerContentManagerState()
}
