'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from './ui/button';
import { Product } from '@/data/products';
import { useTranslation } from '@/lib/use-translation';
import { useToast } from '@/lib/toast-context';
import { useWishlist } from '@/lib/wishlist-store';
import { useAuthStore } from '@/lib/auth-store';
import AuthGateDialog from '@/components/AuthGateDialog';

type WishlistButtonProps = {
    product: Product;
    className?: string;
    asButton?: boolean;
};

export default function WishlistButton({
    product,
    className = '',
    asButton = false,
}: WishlistButtonProps): React.ReactElement {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const storedIsInWishlist = useWishlist((state) => state.isInWishlist(product.id));
    const toggleItem = useWishlist((state) => state.toggleItem);

    const [popping, setPopping] = useState(false)
    const [authGateOpen, setAuthGateOpen] = useState(false)
    const popTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isClient = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    )
    const isInWishlist = isClient && storedIsInWishlist

    // Zustand persist restores localStorage before React hydrates this component.
    // Keep the first client render identical to SSR, then reveal persisted state.
    useEffect(() => {
        return () => {
            if (popTimerRef.current) clearTimeout(popTimerRef.current)
        }
    }, [])

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        event.stopPropagation()

        if (!isAuthenticated) {
            setAuthGateOpen(true)
            return
        }

        if (popTimerRef.current) clearTimeout(popTimerRef.current)
        setPopping(true)
        popTimerRef.current = setTimeout(() => setPopping(false), 400)

        const added = toggleItem(product)
        showToast(
            t(added ? 'toast.addedToWishlist' : 'toast.removedFromWishlist'),
            added ? 'success' : 'info'
        )
    };

    const heartPath = "M12 21s-6.716-4.348-9.193-8.027C.664 9.763 1.35 5.39 5.09 3.8c2.037-.867 4.368-.279 5.91 1.47 1.542-1.749 3.873-2.337 5.91-1.47 3.74 1.59 4.426 5.963 2.283 9.173C18.716 16.652 12 21 12 21z"

    if (asButton) {
        return (
            <>
                <Button
                    onClick={handleClick}
                    variant="default"
                    className={`flex items-center justify-center gap-2 w-full add-to-cart__button bg-pink-600 hover:bg-pink-700 ${className}`}
                    aria-label={t(isInWishlist ? 'wishlist.removeAria' : 'wishlist.addAria')}
                    title={t(isInWishlist ? 'wishlist.remove' : 'wishlist.add')}
                >
                    <svg
                        className={`h-5 w-5 mr-2${popping ? ' animate-wishlist-pop' : ''}`}
                        viewBox="0 0 24 24"
                        fill={isInWishlist ? 'currentColor' : 'none'}
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path d={heartPath} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t(isInWishlist ? 'wishlist.remove' : 'wishlist.add')}
                </Button>
                <AuthGateDialog open={authGateOpen} onOpenChange={setAuthGateOpen} />
            </>
        );
    }
    return (
        <>
            <button
                type="button"
                onClick={handleClick}
                aria-label={t(isInWishlist ? 'wishlist.removeAria' : 'wishlist.addAria')}
                title={t(isInWishlist ? 'wishlist.remove' : 'wishlist.add')}
                className={`inline-flex items-center justify-center rounded-full border p-2 shadow-sm transition bg-white/95 dark:bg-gray-900/95 ${
                    isInWishlist
                        ? 'border-pink-300 text-pink-600 hover:border-gray-400 hover:text-gray-500 dark:border-pink-500 dark:text-pink-400 dark:hover:border-gray-500 dark:hover:text-gray-400'
                        : 'border-gray-200 text-[#0088C4] hover:border-pink-300 hover:text-pink-600 dark:border-gray-700 dark:text-[#0088C4] dark:hover:border-pink-500 dark:hover:text-pink-400'
                } ${className}`}
            >
                <svg
                    className={`h-5 w-5${popping ? ' animate-wishlist-pop' : ''}`}
                    viewBox="0 0 24 24"
                    fill={isInWishlist ? 'currentColor' : 'none'}
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path d={heartPath} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            <AuthGateDialog open={authGateOpen} onOpenChange={setAuthGateOpen} />
        </>
    );
}
