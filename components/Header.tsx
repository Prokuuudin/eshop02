"use client"
import React, { useState, useEffect, useRef } from 'react'
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

export default function Header() {
  const headerRef = useRef<HTMLElement | null>(null)
  const pathname = usePathname()
  const isAdminPage = pathname.startsWith('/admin')

  // Плавное уменьшение header при скролле, но без исчезновения
  const [scrolled, setScrolled] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);

    // Устанавливаем CSS переменную для main
    const setHeaderOffset = () => {
      if (headerRef.current) {
        document.documentElement.style.setProperty('--header-offset', headerRef.current.offsetHeight + 'px');
      }
    };

    setHeaderOffset();
    window.addEventListener('resize', setHeaderOffset);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', setHeaderOffset);
    };
  }, []);

  // Обновлять переменную при изменении scrolled
  useEffect(() => {
    if (headerRef.current) {
      document.documentElement.style.setProperty('--header-offset', headerRef.current.offsetHeight + 'px');
    }
  }, [scrolled]);

  return (
    <>
      <header
        ref={headerRef}
        className={
          `header fixed top-0 left-0 w-full bg-white dark:bg-gray-900 shadow transition-all duration-300 text-gray-900 dark:text-gray-100 z-[9999]`
        }
          style={{
            transform: scrolled ? 'scaleY(0.92)' : 'scaleY(1)',
            transformOrigin: 'top center',
          }}
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
            {/* Mobile menu button */}
            {!isAdminPage && (
              <button className="md:hidden p-2" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
            )}
          </div>
        </div>
        {!isAdminPage && (
          <>
            {/* Нижняя строка: соцсети, поиск, статус/юзер/корзина */}
            <div className="border-t border-gray-200 border-b border-b-transparent dark:border-t-gray-700 dark:border-b-gray-700 w-full">
              <div className="w-full px-2 sm:px-4 py-2 flex flex-wrap items-center gap-y-2 gap-x-4">
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
          <div className="border-t border-gray-200 dark:border-t-gray-700 w-full px-2 sm:px-4 py-2">
            <AdminHeaderNav />
          </div>
        )}
        <CartDrawer isOpen={cartDrawerOpen} onClose={() => setCartDrawerOpen(false)} />
        {!isAdminPage && <MobileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />}
      </header>
    </>
  )
}
