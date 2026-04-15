'use client'

import React from 'react'
import { Product } from '@/data/products'
import { useTranslation } from '@/lib/use-translation'
import { useToast } from '@/lib/toast-context'
import { useWishlist } from '@/lib/wishlist-store'

type WishlistButtonProps = {
  product: Product
  className?: string
}

export default function WishlistButton({ product, className = '' }: WishlistButtonProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const isInWishlist = useWishlist((state) => state.isInWishlist(product.id))
  const toggleItem = useWishlist((state) => state.toggleItem)

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const added = toggleItem(product)
    showToast(t(added ? 'toast.addedToWishlist' : 'toast.removedFromWishlist'), added ? 'success' : 'info')
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={t(isInWishlist ? 'wishlist.removeAria' : 'wishlist.addAria')}
      title={t(isInWishlist ? 'wishlist.remove' : 'wishlist.add')}
      className={`inline-flex items-center justify-center rounded-full border border-gray-200 bg-white/95 p-2 text-gray-700 shadow-sm transition hover:border-pink-300 hover:text-pink-600 dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-200 dark:hover:border-pink-500 dark:hover:text-pink-400 ${className}`}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill={isInWishlist ? 'currentColor' : 'none'} xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 21s-6.716-4.348-9.193-8.027C.664 9.763 1.35 5.39 5.09 3.8c2.037-.867 4.368-.279 5.91 1.47 1.542-1.749 3.873-2.337 5.91-1.47 3.74 1.59 4.426 5.963 2.283 9.173C18.716 16.652 12 21 12 21z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}