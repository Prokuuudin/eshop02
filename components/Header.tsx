"use client"
import React, { useState, useEffect } from 'react'
import { useUnprefixedPathname } from '@/lib/i18n-context'
import MobileMenu from './MobileMenu'
import CartDrawer from './CartDrawer'
import HeaderNav from './HeaderNav'
import HeaderSearch from './HeaderSearch'
import HeaderActions from './HeaderActions'
import HeaderLogo from './HeaderLogo'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'
import AdminHeaderNav from './admin/AdminHeaderNav'
import { Menu } from 'lucide-react'
import { useTranslation } from '@/lib/use-translation'

export default function Header(): React.ReactElement {
  const { t } = useTranslation()
  const pathname = useUnprefixedPathname()
  const isAdminPage = pathname.startsWith('/admin')

  // Плавное уменьшение header при скролле, но без исчезновения.
  // Только переключаем булев флаг — без измерения offsetHeight (sticky сам держит layout).
  const [scrolled, setScrolled] = useState(false);
  const compactHeader = scrolled && !isAdminPage;
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // Separate enter/exit thresholds prevent the sticky header from oscillating when its
    // own height change moves scrollY back and forth around a single boundary.
    const handleScroll = () => {
      const y = window.scrollY;
      setScrolled((current) => current ? y > 4 : y > 24);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <header
        className="header sticky top-0 w-full bg-white dark:bg-card shadow transition-all duration-300 text-foreground z-header"
      >
        {/* Верхняя строка: логотип, навигация, действия */}
          <div className={`mx-auto flex w-full max-w-[1440px] items-center gap-1 px-4 transition-[min-height] duration-300 ${compactHeader ? 'py-0 min-h-[12px]' : 'py-0 min-h-[16px]'}`}>
          {/* Логотип слева */}
          <div className="flex min-w-0 flex-shrink-0 items-center">
            <HeaderLogo />
          </div>
          {/* Навигация по центру (desktop) */}
          <div className="hidden min-[880px]:flex flex-1 min-w-0 justify-center">
            <HeaderNav onlyCatalog={isAdminPage} />
          </div>
          {/* Действия справа */}
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            <div className="hidden min-[880px]:flex items-center gap-2">
              <HeaderActions onlyLangSwitcher />
              <ThemeToggle responsive />
              {isAdminPage && <UserMenu />}
            </div>
            {/* Mobile: lang switcher + theme + menu button */}
            <div className="min-[880px]:hidden flex items-center gap-1">
              <HeaderActions onlyLangSwitcher />
              <ThemeToggle compact />
              {!isAdminPage && (
                <button className="p-2" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
                  <Menu className="w-7 h-7" />
                </button>
              )}
            </div>
          </div>
        </div>
        {!isAdminPage && (
          <>
            {/* Нижняя строка: соцсети, поиск, статус/юзер/корзина */}
            <div className="w-full border-y border-border bg-gray-200 dark:bg-gray-800">
              <div className={`mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-2 gap-y-1 px-4 transition-[padding] duration-300 sm:gap-x-4 sm:gap-y-2 ${scrolled ? 'py-1' : 'py-2'}`}>
                <div className="order-2 min-w-0 basis-full md:order-none md:flex-1 max-w-xl">
                  <HeaderSearch />
                </div>
                <div className="hidden shrink-0 items-center gap-1 md:ml-auto md:flex">
                  <a href="https://instagram.com/" target="_blank" rel="noopener noreferrer" aria-label={t('footer.instagram')} className="rounded-md p-2 text-brand transition-colors hover:bg-black/5 hover:text-pink-600 dark:text-white dark:hover:bg-white/10 dark:hover:text-pink-400">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect width="18" height="18" x="3" y="3" rx="5" strokeWidth="1.5"/><circle cx="12" cy="12" r="4" strokeWidth="1.5"/><circle cx="17" cy="7" r="1" fill="currentColor" stroke="none"/></svg>
                  </a>
                  <a href="https://facebook.com/" target="_blank" rel="noopener noreferrer" aria-label={t('footer.facebook')} className="rounded-md p-2 text-brand transition-colors hover:bg-black/5 hover:text-blue-600 dark:text-white dark:hover:bg-white/10 dark:hover:text-blue-400">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect width="18" height="18" x="3" y="3" rx="5" strokeWidth="1.5"/><path d="M15 8h-2a1 1 0 0 0-1 1v2h3l-.5 2H12v6h-2v-6H8v-2h2V9a3 3 0 0 1 3-3h2v2z" fill="currentColor" stroke="none"/></svg>
                  </a>
                  <a href="https://youtube.com/" target="_blank" rel="noopener noreferrer" aria-label={t('footer.youtube')} className="rounded-md p-2 text-brand transition-colors hover:bg-black/5 hover:text-red-600 dark:text-white dark:hover:bg-white/10 dark:hover:text-red-400">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect width="18" height="18" x="3" y="3" rx="5" strokeWidth="1.5"/><polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none"/></svg>
                  </a>
                </div>
                <div className="ml-auto flex flex-shrink-0 items-center gap-1 sm:gap-2">
                  <UserMenu />
                  <HeaderActions onCartOpen={() => setCartDrawerOpen(true)} hideLangSwitcher hideUserMenu />
                </div>
              </div>
            </div>
          </>
        )}
        {isAdminPage && (
          <div className="mx-auto w-full max-w-[1440px] border-t border-border px-2 py-2 sm:px-4">
            <AdminHeaderNav />
          </div>
        )}
        <CartDrawer isOpen={cartDrawerOpen} onClose={() => setCartDrawerOpen(false)} />
        {!isAdminPage && <MobileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />}
      </header>
    </>
  )
}
