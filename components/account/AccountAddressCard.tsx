'use client'

import Link from 'next/link'
import ConfirmActionDialog from '@/components/ConfirmActionDialog'
import { Button } from '@/components/ui/button'
import type { SavedAddress } from '@/lib/saved-addresses-store'

type AddressField = 'firstName' | 'lastName' | 'phone' | 'address' | 'city' | 'postalCode'

type AccountAddressCardLabels = {
  firstName: string
  lastName: string
  phone: string
  address: string
  city: string
  postalCode: string
  postalCodeLabel: string
  useAddress: string
  editAddress: string
  deleteAddress: string
  cancel: string
  save: string
  confirmTitle: string
  confirmDeleteAddress: string
  delete: string
}

type Props = {
  addressItem: SavedAddress
  isEditing: boolean
  draft: SavedAddress | null
  errors: Record<string, string>
  checkoutHref: string
  labels: AccountAddressCardLabels
  onDraftChange: (field: AddressField, value: string) => void
  onCancel: () => void
  onSave: () => void
  onStartEdit: () => void
  onDelete: () => void
}

export default function AccountAddressCard({
  addressItem,
  isEditing,
  draft,
  errors,
  checkoutHref,
  labels,
  onDraftChange,
  onCancel,
  onSave,
  onStartEdit,
  onDelete
}: Props) {
  if (isEditing && draft) {
    return (
      <div className="rounded-2xl border border-gray-200 p-4 shadow-sm dark:border-gray-700">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <input
                className={`w-full rounded border px-2 py-1 text-xs ${errors.firstName ? 'border-red-500' : ''}`}
                value={draft.firstName}
                onChange={(event) => onDraftChange('firstName', event.target.value)}
                placeholder={labels.firstName}
              />
              {errors.firstName && <p className="mt-1 text-xs text-red-600">{errors.firstName}</p>}
            </div>
            <div>
              <input
                className={`w-full rounded border px-2 py-1 text-xs ${errors.lastName ? 'border-red-500' : ''}`}
                value={draft.lastName}
                onChange={(event) => onDraftChange('lastName', event.target.value)}
                placeholder={labels.lastName}
              />
              {errors.lastName && <p className="mt-1 text-xs text-red-600">{errors.lastName}</p>}
            </div>
            <div>
              <input
                className={`w-full rounded border px-2 py-1 text-xs ${errors.phone ? 'border-red-500' : ''}`}
                value={draft.phone}
                onChange={(event) => onDraftChange('phone', event.target.value)}
                placeholder={labels.phone}
              />
              {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
            </div>
            <div>
              <input
                className={`w-full rounded border px-2 py-1 text-xs ${errors.address ? 'border-red-500' : ''}`}
                value={draft.address}
                onChange={(event) => onDraftChange('address', event.target.value)}
                placeholder={labels.address}
              />
              {errors.address && <p className="mt-1 text-xs text-red-600">{errors.address}</p>}
            </div>
            <div>
              <input
                className={`w-full rounded border px-2 py-1 text-xs ${errors.city ? 'border-red-500' : ''}`}
                value={draft.city}
                onChange={(event) => onDraftChange('city', event.target.value)}
                placeholder={labels.city}
              />
              {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city}</p>}
            </div>
            <div>
              <input
                className="w-full rounded border px-2 py-1 text-xs"
                value={draft.postalCode ?? ''}
                onChange={(event) => onDraftChange('postalCode', event.target.value)}
                placeholder={labels.postalCode}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onCancel}>
              {labels.cancel}
            </Button>
            <Button size="sm" onClick={onSave}>
              {labels.save}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 p-4 shadow-sm dark:border-gray-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{addressItem.firstName} {addressItem.lastName}</p>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{addressItem.address}, {addressItem.city}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">Address</span>
      </div>
      {addressItem.postalCode && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">{labels.postalCodeLabel}: {addressItem.postalCode}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-3">
        <Link href={checkoutHref} className="inline-block text-xs text-indigo-600 dark:text-indigo-300">
          {labels.useAddress}
        </Link>
        <button
          className="text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
          onClick={onStartEdit}
        >
          {labels.editAddress}
        </button>
        <ConfirmActionDialog
          title={labels.confirmTitle}
          description={labels.confirmDeleteAddress}
          confirmLabel={labels.delete}
          cancelLabel={labels.cancel}
          onConfirm={onDelete}
          trigger={<button className="text-xs text-red-600 hover:text-red-700">{labels.deleteAddress}</button>}
        />
      </div>
    </div>
  )
}