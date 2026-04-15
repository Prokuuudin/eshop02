import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import UserMenu from './UserMenu';
import LanguageSwitcher from './LanguageSwitcher';
import { useCart } from '@/lib/cart-store';
import { useWishlist } from '@/lib/wishlist-store';
import { useTranslation } from '@/lib/use-translation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

export default function HeaderActions({
  onCartOpen,
  onlyLangSwitcher = false,
  hideLangSwitcher = false,
  hideUserMenu = false
}: {
  onCartOpen?: () => void
  onlyLangSwitcher?: boolean
  hideLangSwitcher?: boolean
  hideUserMenu?: boolean
}) {
  const { items } = useCart();
  const wishlistItems = useWishlist((state) => state.items)
  const { t } = useTranslation();
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const wishlistCount = wishlistItems.length
  const cartCountLabel = cartCount > 99 ? '99+' : String(cartCount)
  const wishlistCountLabel = wishlistCount > 99 ? '99+' : String(wishlistCount)
  if (onlyLangSwitcher) {
    return (
      <div className="header__right flex items-center gap-3">
        <Suspense fallback={null}>
          <LanguageSwitcher />
        </Suspense>
      </div>
    );
  }
  return (
    <TooltipProvider delayDuration={150}>
      <div className="header__right flex items-center gap-3">
      {!hideLangSwitcher && (
        <Suspense fallback={null}>
          <LanguageSwitcher />
        </Suspense>
      )}
      {!hideUserMenu && <UserMenu />}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href="/wishlist" aria-label={t('nav.wishlist')} className="relative inline-flex">
            <Button variant="ghost" size="icon" className="relative text-foreground">
              <svg className="h-7 w-7 text-foreground" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M12 21s-6.716-4.348-9.193-8.027C.664 9.763 1.35 5.39 5.09 3.8c2.037-.867 4.368-.279 5.91 1.47 1.542-1.749 3.873-2.337 5.91-1.47 3.74 1.59 4.426 5.963 2.283 9.173C18.716 16.652 12 21 12 21z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {wishlistCount > 0 && (
                <Badge className="pointer-events-none absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pink-600 px-1 text-[10px] font-semibold leading-none text-white">
                  {wishlistCountLabel}
                </Badge>
              )}
            </Button>
          </Link>
        </TooltipTrigger>
        <TooltipContent>{t('nav.wishlist')}</TooltipContent>
      </Tooltip>
      {onCartOpen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onCartOpen}
              variant="ghost"
              size="icon"
              className="header__cart relative text-foreground"
              aria-label={t('header.openCartAria')}
            >
              <svg className="h-8 w-8 text-foreground" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 6h15l-1.5 9h-12L6 6z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="10" cy="20" r="1.2" fill="currentColor" />
                <circle cx="18" cy="20" r="1.2" fill="currentColor" />
              </svg>
              {cartCount > 0 && (
                <Badge className="header__cart-badge pointer-events-none absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
                  {cartCountLabel}
                </Badge>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('header.openCart')}</TooltipContent>
        </Tooltip>
      )}
      </div>
    </TooltipProvider>
  );
}
