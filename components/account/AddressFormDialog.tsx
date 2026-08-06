'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { SavedAddress } from '@/lib/saved-addresses-store'

interface AddressFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  draft: SavedAddress
  errors: Record<string, string>
  onDraftChange: (field: string, value: string) => void
  onSave: () => void
  onCancel: () => void
  labels: {
    firstName: string
    lastName: string
    phone: string
    address: string
    city: string
    postalCode: string
    cancel: string
    save: string
  }
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: string
  className?: string
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={error
          ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_3px_rgba(248,113,113,0.10)]'
          : 'focus-visible:border-primary/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.10)]'}
      />
      {error && <p className="mt-1 text-xs leading-4 text-red-500 dark:text-red-400">{error}</p>}
    </div>
  )
}

export function AddressFormDialog({
  open,
  onOpenChange,
  title,
  draft,
  errors,
  onDraftChange,
  onSave,
  onCancel,
  labels,
}: AddressFormDialogProps): React.ReactElement {
  const handleCancel = () => {
    onCancel()
    onOpenChange(false)
  }

  const handleSave = () => {
    onSave()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); else onOpenChange(v) }}>
      <DialogContent className="address-form-dialog sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="address-form-dialog__body mt-2 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={labels.firstName}
              value={draft.firstName}
              onChange={(v) => onDraftChange('firstName', v)}
              error={errors.firstName}
            />
            <Field
              label={labels.lastName}
              value={draft.lastName}
              onChange={(v) => onDraftChange('lastName', v)}
              error={errors.lastName}
            />
          </div>

          <Field
            label={labels.phone}
            value={draft.phone}
            onChange={(v) => onDraftChange('phone', v)}
            error={errors.phone}
          />

          <Field
            label={labels.address}
            value={draft.address}
            onChange={(v) => onDraftChange('address', v)}
            error={errors.address}
          />

          <div className="grid grid-cols-2 gap-4">
            <Field
              label={labels.city}
              value={draft.city}
              onChange={(v) => onDraftChange('city', v)}
              error={errors.city}
            />
            <Field
              label={labels.postalCode}
              value={draft.postalCode ?? ''}
              onChange={(v) => onDraftChange('postalCode', v)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={handleCancel}>
            {labels.cancel}
          </Button>
          <Button onClick={handleSave}>
            {labels.save}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
