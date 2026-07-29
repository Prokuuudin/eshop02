'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { BookmarkPlus } from 'lucide-react'
import { useOrderTemplatesStore } from '@/lib/order-templates-store'
import { getCurrentUser } from '@/lib/auth'
import { useTranslation } from '@/lib/use-translation'
import { useToast } from '@/lib/toast-context'
import type { CartItem } from '@/lib/cart-store'

interface SaveAsTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: CartItem[]
  defaultName?: string
}

export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  items,
  defaultName = '',
}: SaveAsTemplateDialogProps): React.ReactElement {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { create } = useOrderTemplatesStore()
  const [name, setName] = useState(defaultName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      queueMicrotask(() => setName(defaultName))
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, defaultName])

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const user = getCurrentUser()
    if (!user) return
    create(user.id, trimmed, items)
    showToast(t('templates.savedToast'), 'success')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus className="w-4 h-4 text-primary" />
            {t('templates.saveDialog.title')}
          </DialogTitle>
          <DialogDescription>{t('templates.saveDialog.desc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('templates.saveDialog.nameLabel')}
            </label>
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('templates.saveDialog.namePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              maxLength={60}
            />
          </div>
          <p className="text-xs text-gray-400">
            {items.length} {t('templates.saveDialog.itemsCount')}
          </p>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              className="flex-1 bg-primary hover:bg-primary/90"
              onClick={handleSave}
              disabled={!name.trim()}
            >
              {t('templates.saveDialog.confirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
