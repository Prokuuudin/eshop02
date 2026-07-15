"use client"
import React, { useState } from 'react'
import { useTranslation } from '@/lib/use-translation'
import Link from 'next/link'
import { Button } from './ui/button'
import { useAuthStore } from '@/lib/auth-store'
import { useCategoriesConfig } from '@/lib/use-categories-config'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from './ui/dialog'
import LoginForm from './auth/LoginForm'
import RegisterSwitcher from './auth/RegisterSwitcher'
import ForgotPasswordForm from './auth/ForgotPasswordForm'

type Props = {
  isOpen: boolean
  onClose: () => void
}

export default function MobileMenu({ isOpen, onClose }: Props) {
  const { t, language } = useTranslation();
  const { categories } = useCategoriesConfig();
  const [expandCategories, setExpandCategories] = useState(false);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const [loginOpen, setLoginOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const handleLoginSuccess = () => {
    setLoginOpen(false);
    setForgotOpen(false);
    onClose();
  };
  const menuLinkClass =
    'inline-flex w-full items-center rounded-md px-2 py-2 text-base font-medium transition-colors duration-200 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/80/15 dark:hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

  if (!isOpen) return null;

  return (
    <div className="header__menu-overlay fixed inset-0 z-drawer">
      <div className="header__menu-backdrop absolute inset-0 bg-black/40" onClick={onClose} />

      <nav className="header__menu absolute top-0 left-0 right-0 max-h-[90vh] overflow-y-auto bg-card text-foreground shadow-md p-4 z-drawer border-b border-border">
        <div className="header__menu-top flex items-center justify-between mb-4">
          <div className="header__brand flex items-center gap-3">
            <Link href="/" className="header__brand-link text-lg font-semibold" onClick={onClose}>
              Eshop
            </Link>
          </div>
          <Button aria-label={t('mobileMenu.closeAria')} onClick={onClose} size="icon" className="header__menu-close">
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
              className="w-full text-left flex items-center justify-between rounded-md px-2 py-2 text-base font-medium transition-colors duration-200 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/80/15 dark:hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              aria-expanded={expandCategories}
            >
              <span>{t('categories.title')}</span>
              <span className={`transform transition-transform ${expandCategories ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {expandCategories && (
              <ul className="ml-4 mt-2 space-y-2 border-l border-border pl-3">
                {categories.map((cat) => {
                  const catLabel = cat.titleKey ? t(cat.titleKey, cat.labels[language]) : cat.labels[language];
                  const subcategories = cat.subcategories ?? [];
                  const subLinkClass = 'inline-flex w-full items-center rounded-md px-2 py-1 text-sm transition-colors duration-200 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/80/15 dark:hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

                  if (subcategories.length === 0) {
                    return (
                      <li key={cat.id}>
                        <Link href={`/catalog?cat=${cat.id}`} onClick={onClose} className={subLinkClass}>
                          {catLabel}
                        </Link>
                      </li>
                    );
                  }

                  const expanded = expandedCategoryId === cat.id;
                  return (
                    <li key={cat.id}>
                      <button
                        type="button"
                        onClick={() => setExpandedCategoryId(expanded ? null : cat.id)}
                        className="w-full text-left flex items-center justify-between rounded-md px-2 py-1 text-sm transition-colors duration-200 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/80/15 dark:hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        aria-expanded={expanded}
                      >
                        <span>{catLabel}</span>
                        <span className={`transform transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</span>
                      </button>
                      {expanded && (
                        <ul className="ml-3 mt-1 space-y-1 border-l border-border pl-3">
                          <li>
                            <Link href={`/catalog?cat=${cat.id}`} onClick={onClose} className={subLinkClass}>
                              {t('categories.all')}
                            </Link>
                          </li>
                          {subcategories.map((sub) => (
                            <li key={sub.slug}>
                              <Link
                                href={`/catalog?cat=${cat.id}&subcat=${encodeURIComponent(sub.slug)}`}
                                onClick={onClose}
                                className={subLinkClass}
                              >
                                {sub.key ? t(sub.key, sub.labels[language]) : sub.labels[language]}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
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
            <Link href="/contact" onClick={onClose} className={menuLinkClass}>
              {t('nav.contact')}
            </Link>
          </li>
        </ul>

        <div className="header__menu-actions mt-6 flex flex-col gap-3 border-t border-border pt-4">
          <Link href="/cart" onClick={onClose} className="w-full">
            <Button className="w-full">{t('nav.cart')}</Button>
          </Link>
          {user ? (
            <Link href="/account" onClick={onClose} className="w-full">
              <Button variant="outline" className="w-full">{t('nav.account')}</Button>
            </Link>
          ) : (
            <>
              <Button variant="outline" className="w-full" onClick={() => setLoginOpen(true)}>
                {t('auth.login')}
              </Button>
              <Button className="w-full" onClick={() => setRegisterOpen(true)}>
                {t('auth.registerButton', t('auth.register'))}
              </Button>
            </>
          )}
        </div>

        <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('auth.login')}</DialogTitle>
            </DialogHeader>
            <LoginForm
              onSuccess={handleLoginSuccess}
              onForgotPassword={() => { setLoginOpen(false); setForgotOpen(true); }}
            />
            <DialogClose asChild>
              <Button variant="outline" className="mt-4 w-full">{t('common.close')}</Button>
            </DialogClose>
          </DialogContent>
        </Dialog>
        <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('auth.resetPassword')}</DialogTitle>
            </DialogHeader>
            <ForgotPasswordForm />
            <DialogClose asChild>
              <Button variant="outline" className="mt-4 w-full">{t('common.close')}</Button>
            </DialogClose>
          </DialogContent>
        </Dialog>
        <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
          <DialogContent>
            <DialogTitle className="sr-only">{t('auth.register')}</DialogTitle>
            <RegisterSwitcher onClose={() => { setRegisterOpen(false); onClose(); }} />
          </DialogContent>
        </Dialog>

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
