'use client'

import Link from 'next/link'
import { MapPin, Pencil, Trash2, ShoppingCart } from 'lucide-react'
import ConfirmActionDialog from '@/components/ConfirmActionDialog'
import { AddressFormDialog } from '@/components/account/AddressFormDialog'
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
  onDelete,
}: Props) {
  return (
    <>
      <div className="account-address-card flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        {/* Основная информация */}
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
            <MapPin className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {addressItem.firstName} {addressItem.lastName}
            </p>
            <p className="text-sm text-muted-foreground truncate">
              {addressItem.address}
            </p>
            <p className="text-sm text-muted-foreground">
              {addressItem.city}{addressItem.postalCode ? `, ${addressItem.postalCode}` : ''}
            </p>
            {addressItem.phone && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {addressItem.phone}
              </p>
            )}
          </div>
        </div>

        {/* Действия */}
        <div className="flex flex-wrap items-center gap-1 border-t border-gray-100 pt-2 dark:border-gray-800">
          <Link
            href={checkoutHref}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/5 dark:text-primary dark:hover:bg-indigo-950/40 transition-colors"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            {labels.useAddress}
          </Link>

          <button
            onClick={onStartEdit}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            {labels.editAddress}
          </button>

          <ConfirmActionDialog
            title={labels.confirmTitle}
            description={labels.confirmDeleteAddress}
            confirmLabel={labels.delete}
            cancelLabel={labels.cancel}
            onConfirm={onDelete}
            trigger={
              <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
                {labels.deleteAddress}
              </button>
            }
          />
        </div>
      </div>

      {isEditing && draft && (
        <AddressFormDialog
          open={isEditing}
          onOpenChange={(open) => { if (!open) onCancel() }}
          title={labels.editAddress}
          draft={draft}
          errors={errors}
          onDraftChange={(field, value) => onDraftChange(field as AddressField, value)}
          onSave={onSave}
          onCancel={onCancel}
          labels={labels}
        />
      )}
    </>
  )
}
