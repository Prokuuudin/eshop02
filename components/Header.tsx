"use client"
import React, { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
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

export default function Header() {
  const pathname = usePathname()
  const isAdminPage = pathname.startsWith('/admin')

  // Плавное уменьшение header при скролле, но без исчезновения.
  // Только переключаем булев флаг — без измерения offsetHeight (sticky сам держит layout).
  const [scrolled, setScrolled] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <header
        className="header sticky top-0 w-full bg-[#EAAC63] dark:bg-card shadow transition-all duration-300 text-foreground z-header"
      >
        {/* Верхняя строка: логотип, навигация, действия */}
          <div className={`w-full px-2 sm:px-4 flex items-center relative transition-all duration-300 ${scrolled ? 'py-0 min-h-[12px]' : 'py-0 min-h-[16px]'}`}>
          {/* Логотип слева */}
          <div className="flex items-center flex-shrink-0 min-w-[100px]">
            <HeaderLogo />
          </div>
          {/* Навигация по центру (desktop) */}
          <div className="hidden md:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-auto max-w-[60%]">
            <HeaderNav onlyCatalog={isAdminPage} />
          </div>
          {/* Действия справа */}
          <div className="flex items-center gap-2 ml-auto">
            <div className="hidden md:flex items-center gap-2">
              <HeaderActions onlyLangSwitcher />
              <ThemeToggle />
              {isAdminPage && <UserMenu />}
            </div>
            {/* Mobile: lang switcher + menu button */}
            {!isAdminPage && (
              <div className="md:hidden flex items-center gap-1">
                <HeaderActions onlyLangSwitcher />
                <button className="p-2" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
                  <Menu className="w-7 h-7" />
                </button>
              </div>
            )}
          </div>
        </div>
        {!isAdminPage && (
          <>
            {/* Нижняя строка: соцсети, поиск, статус/юзер/корзина */}
            <div className="border-t border-border border-b border-b-transparent dark:border-b-border w-full">
              <div className={`w-full px-2 sm:px-4 flex flex-wrap items-center gap-y-2 gap-x-4 transition-all duration-300 ${scrolled ? 'py-1' : 'py-2'}`}>
                <div className="flex-1 min-w-0 order-2 md:order-none w-full max-w-xl mx-auto">
                  <HeaderSearch />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                  <UserMenu />
                  <HeaderActions onCartOpen={() => setCartDrawerOpen(true)} hideLangSwitcher hideUserMenu />
                </div>
              </div>
            </div>
          </>
        )}
        {isAdminPage && (
          <div className="border-t border-border w-full px-2 sm:px-4 py-2">
            <AdminHeaderNav />
          </div>
        )}
        <CartDrawer isOpen={cartDrawerOpen} onClose={() => setCartDrawerOpen(false)} />
        {!isAdminPage && <MobileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />}
      </header>
    </>
  )
}
