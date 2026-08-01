'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Download, Grid2X2, LayoutList } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaFile = {
  name: string
  path: string
  size: number
  isImage: boolean
  ext: string
  createdAt: string
  modifiedAt: string
}

type SortKey = 'date' | 'name' | 'size'
type ViewMode = 'grid' | 'list'
type FilterType = 'all' | 'image' | 'other'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function useAdminMediaPage() {
  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [sort, setSort] = useState<SortKey>('date')
  const [view, setView] = useState<ViewMode>('grid')

  const [selected, setSelected] = useState<MediaFile | null>(null)
  const [checkedNames, setCheckedNames] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  // Usage: filePath → list of product titles that use it
  const [usageMap, setUsageMap] = useState<Map<string, string[]>>(new Map())

  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  const showMsg = (text: string, error = false) => {
    setMessage({ text, error })
    setTimeout(() => setMessage(null), 4000)
  }

  // ── Load media files ────────────────────────────────────────────────────────

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/media', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { files: MediaFile[] }
      setFiles(data.files)
    } catch {
      showMsg('Не удалось загрузить файлы.', true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void loadFiles()
    })
    return () => {
      cancelled = true
    }
  }, [loadFiles])

  // ── Load product usage ──────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/admin/products')
      .then((r) => r.json())
      .then((data: { data?: { products?: Record<string, unknown>[] } }) => {
        const products = data.data?.products ?? []
        const map = new Map<string, string[]>()
        products.forEach((p) => {
          const title = String(p.title ?? p.id ?? '')
          const paths: string[] = []
          if (p.image) paths.push(String(p.image))
          if (Array.isArray(p.images)) p.images.forEach((img) => paths.push(String(img)))
          paths.forEach((imgPath) => {
            if (!map.has(imgPath)) map.set(imgPath, [])
            map.get(imgPath)!.push(title)
          })
        })
        setUsageMap(map)
      })
      .catch(() => {})
  }, [])

  // ── Derived: filtered + sorted ──────────────────────────────────────────────

  const displayed = useMemo(() => {
    const q = search.toLowerCase()
    return files
      .filter((f) => {
        if (q && !f.name.toLowerCase().includes(q)) return false
        if (filter === 'image' && !f.isImage) return false
        if (filter === 'other' && f.isImage) return false
        return true
      })
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name)
        if (sort === 'size') return b.size - a.size
        return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
      })
  }, [files, search, filter, sort])

  const isAllChecked = displayed.length > 0 && displayed.every((f) => checkedNames.has(f.name))
  const isSomeChecked = displayed.some((f) => checkedNames.has(f.name))

  const toggleCheck = (name: string) => {
    setCheckedNames((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleAll = () => {
    if (isAllChecked) {
      setCheckedNames(new Set())
    } else {
      setCheckedNames(new Set(displayed.map((f) => f.name)))
    }
  }

  // ── Upload ──────────────────────────────────────────────────────────────────

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    if (!picked.length) return
    setUploading(true)
    let ok = 0, fail = 0
    for (const file of picked) {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/content/upload', { method: 'POST', body: fd })
      if (res.ok) { ok++ } else { fail++ }
    }
    e.target.value = ''
    setUploading(false)
    showMsg(fail === 0 ? `Загружено: ${ok}` : `Загружено: ${ok}, ошибок: ${fail}`, fail > 0 && ok === 0)
    await loadFiles()
  }

  // ── Replace ─────────────────────────────────────────────────────────────────

  const onReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selected) return
    const file = e.target.files?.[0]
    if (!file) return
    setReplacing(true)
    try {
      const fd = new FormData()
      fd.append('name', selected.name)
      fd.append('file', file)
      const res = await fetch('/api/admin/media/replace', { method: 'POST', body: fd })
      if (!res.ok) throw new Error()
      showMsg(`Файл «${selected.name}» заменён. Все ссылки на него обновлены автоматически.`)
      await loadFiles()
    } catch {
      showMsg('Не удалось заменить файл.', true)
    } finally {
      setReplacing(false)
      e.target.value = ''
    }
  }

  // ── Delete single ───────────────────────────────────────────────────────────

  const onDelete = async (file: MediaFile) => {
    if (!confirm(`Удалить «${file.name}»?\n\nЕсли файл используется в товарах — ссылки сломаются.`)) return
    const res = await fetch('/api/admin/media', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: [file.name] }),
    })
    if (res.ok) {
      if (selected?.name === file.name) setSelected(null)
      showMsg(`Файл «${file.name}» удалён.`)
      await loadFiles()
    } else {
      showMsg('Не удалось удалить файл.', true)
    }
  }

  // ── Bulk delete ─────────────────────────────────────────────────────────────

  const onBulkDelete = async () => {
    const names = Array.from(checkedNames)
    if (!names.length) return
    if (!confirm(`Удалить ${names.length} файлов?\n\nЕсли они используются в товарах — ссылки сломаются.`)) return
    setBulkDeleting(true)
    try {
      const res = await fetch('/api/admin/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names }),
      })
      const data = (await res.json()) as { deleted: number; errors: string[] }
      setCheckedNames(new Set())
      if (selected && names.includes(selected.name)) setSelected(null)
      showMsg(`Удалено: ${data.deleted}${data.errors.length ? `, ошибок: ${data.errors.length}` : ''}`)
      await loadFiles()
    } catch {
      showMsg('Ошибка при удалении.', true)
    } finally {
      setBulkDeleting(false)
    }
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  const totalSize = files.reduce((s, f) => s + f.size, 0)
  const imgCount = files.filter((f) => f.isImage).length

  // ── Render ──────────────────────────────────────────────────────────────────

    return { files, setFiles, loading, setLoading, uploading, setUploading, replacing, setReplacing, bulkDeleting, setBulkDeleting, message, setMessage, search, setSearch, filter, setFilter, sort, setSort, view, setView, selected, setSelected, checkedNames, setCheckedNames, copied, setCopied, usageMap, setUsageMap, fileInputRef, replaceInputRef, showMsg, loadFiles, displayed, isAllChecked, isSomeChecked, toggleCheck, toggleAll, onUpload, onReplace, onDelete, onBulkDelete, totalSize, imgCount }
}
