import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import UserMenu from './UserMenu';
import LanguageSwitcher from './LanguageSwitcher';
import { useCart } from '@/lib/cart-store';
import { useWishlist } from '@/lib/wishlist-store';
import { useTranslation } from '@/lib/use-translation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Heart, ShoppingCart } from 'lucide-react';

const headerActionClass = 'relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-brand transition-colors hover:border-border hover:bg-black/5 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:text-white dark:hover:bg-white/10 dark:hover:text-white';
const headerBadgeClass = 'pointer-events-none absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground';

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
}): React.ReactElement {
  const { items } = useCart();
  const wishlistItems = useWishlist((state) => state.items)
  const { t } = useTranslation();
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const prevCartCountRef = useRef(cartCount)
  const [cartBumping, setCartBumping] = useState(false)

  useEffect(() => {
    if (cartCount > prevCartCountRef.current) {
      setCartBumping(true)
      const timer = setTimeout(() => setCartBumping(false), 400)
      prevCartCountRef.current = cartCount
      return () => clearTimeout(timer)
    }
    prevCartCountRef.current = cartCount
  }, [cartCount])

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
      <div className="header__right flex items-center gap-1">
      {!hideLangSwitcher && (
        <Suspense fallback={null}>
          <LanguageSwitcher />
        </Suspense>
      )}
      {!hideUserMenu && <UserMenu />}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href="/wishlist" aria-label={t('nav.wishlist')} className={headerActionClass}>
            <Heart
              aria-hidden="true"
              strokeWidth={1.5}
              style={{ width: 19.8, height: 19.8 }}
              className={wishlistCount > 0 ? 'fill-current' : ''}
            />
            {wishlistCount > 0 && (
              <Badge className={headerBadgeClass}>
                {wishlistCountLabel}
              </Badge>
            )}
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
              className={`header__cart ${headerActionClass}`}
              aria-label={t('header.openCartAria')}
            >
              <span className={cartBumping ? 'animate-cart-bump inline-flex' : 'inline-flex'}>
                <ShoppingCart
                  aria-hidden="true"
                  strokeWidth={1.5}
                  style={{ width: 20.7, height: 20.7 }}
                />
              </span>
              {cartCount > 0 && (
                <Badge className={`header__cart-badge ${headerBadgeClass} ${cartBumping ? 'animate-cart-bump' : ''}`}>
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
