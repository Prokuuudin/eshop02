"use client"
import React, { useState } from 'react'
import { useTranslation } from '@/lib/use-translation'
import Link from 'next/link'
import { Button } from './ui/button'

type Props = {
  isOpen: boolean
  onClose: () => void
}

const CATEGORIES = [
  { id: 'hair', labelKey: 'categories.haircare', fallback: 'Hair care' },
  { id: 'face', labelKey: 'categories.skincare', fallback: 'Skincare' },
  { id: 'body', labelKey: 'categories.bodycare', fallback: 'Body care' },
  { id: 'equipment', labelKey: 'categories.equipment', fallback: 'Equipment' },
  { id: 'nails', labelKey: 'categories.nails', fallback: 'Nails' },
  { id: 'new', labelKey: 'categories.newArrivals', fallback: 'New arrivals' }
]

export default function MobileMenu({ isOpen, onClose }: Props) {
  const { t } = useTranslation();
  const [expandCategories, setExpandCategories] = useState(false);
  const menuLinkClass =
    'inline-flex w-full items-center rounded-md px-2 py-2 text-base font-medium transition-colors duration-200 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60';

  if (!isOpen) return null;

  return (
    <div className="header__menu-overlay fixed inset-0 z-40">
      <div className="header__menu-backdrop absolute inset-0 bg-black/40" onClick={onClose} />

      <nav className="header__menu absolute top-0 left-0 right-0 max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-md p-4 z-50 border-b border-gray-200 dark:border-gray-700">
        <div className="header__menu-top flex items-center justify-between mb-4">
          <div className="header__brand flex items-center gap-3">
            <Link href="/" className="header__brand-link text-lg font-semibold" onClick={onClose}>
              Eshop
            </Link>
          </div>
          <Button aria-label={t('mobileMenu.closeAria')} onClick={onClose} className="header__menu-close">
            ✕
          </Button>
        </div>

        <ul className="header__menu-list space-y-3">
          <li className="header__menu-item">
            <Link href="/#home" onClick={onClose} className={menuLinkClass}>
              {t('nav.home')}
            </Link>
          </li>
          <li className="header__menu-item">
            <Link href="/catalog" onClick={onClose} className={menuLinkClass}>
              {t('nav.catalog')}
            </Link>
          </li>

          {/* Categories dropdown */}
          <li className="header__menu-item">
            <button
              onClick={() => setExpandCategories(!expandCategories)}
              className="w-full text-left flex items-center justify-between rounded-md px-2 py-2 text-base font-medium transition-colors duration-200 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
              aria-expanded={expandCategories}
            >
              <span>{t('categories.title')}</span>
              <span className={`transform transition-transform ${expandCategories ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {expandCategories && (
              <ul className="ml-4 mt-2 space-y-2 border-l border-gray-200 dark:border-gray-700 pl-3">
                {CATEGORIES.map((cat) => (
                  <li key={cat.id}>
                    <Link href={`/catalog?cat=${cat.id}`} onClick={onClose} className="inline-flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors duration-200 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60">
                      {t(cat.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>

          <li className="header__menu-item">
            <Link href="/#brands" onClick={onClose} className={menuLinkClass}>
              {t('nav.brands')}
            </Link>
          </li>
          <li className="header__menu-item">
            <Link href="/catalog" onClick={onClose} className={menuLinkClass}>
              {t('categories.onSale')}
            </Link>
          </li>
          <li className="header__menu-item">
            <Link href="/blog" onClick={onClose} className={menuLinkClass}>
              {t('nav.blog')}
            </Link>
          </li>
          <li className="header__menu-item">
            <Link href="/#faq" onClick={onClose} className={menuLinkClass}>
              {t('nav.faq')}
            </Link>
          </li>
          <li className="header__menu-item">
            <Link href="/about" onClick={onClose} className={menuLinkClass}>
              {t('nav.about')}
            </Link>
          </li>
          <li className="header__menu-item">
            <Link href="/contact" onClick={onClose} className={menuLinkClass}>
              {t('nav.contact')}
            </Link>
          </li>
        </ul>

        <div className="header__menu-actions mt-6 flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
          <Link href="/cart" onClick={onClose} className="w-full">
            <Button className="w-full">{t('nav.cart')}</Button>
          </Link>
          <Link href="/account" onClick={onClose} className="w-full">
            <Button className="w-full">{t('nav.account')}</Button>
          </Link>
        </div>

        {/* Social media links */}
        <div className="header__menu-social mt-6 flex justify-center gap-4">
          <Link href="https://instagram.com/" target="_blank" rel="noopener" aria-label={t('footer.instagram')} className="hover:text-pink-600">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect width="18" height="18" x="3" y="3" rx="5" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5"/><circle cx="17" cy="7" r="1" fill="currentColor"/></svg>
          </Link>
          <Link href="https://facebook.com/" target="_blank" rel="noopener" aria-label={t('footer.facebook')} className="hover:text-blue-600">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect width="18" height="18" x="3" y="3" rx="5" stroke="currentColor" strokeWidth="1.5"/><path d="M15 8h-2a1 1 0 0 0-1 1v2h3l-.5 2H12v6h-2v-6H8v-2h2V9a3 3 0 0 1 3-3h2v2z" fill="currentColor"/></svg>
          </Link>
          <Link href="https://youtube.com/" target="_blank" rel="noopener" aria-label={t('footer.youtube')} className="hover:text-red-600">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect width="18" height="18" x="3" y="3" rx="5" stroke="currentColor" strokeWidth="1.5"/><polygon points="10,8 16,12 10,16" fill="currentColor"/></svg>
          </Link>
        </div>
      </nav>
    </div>
  )
}
