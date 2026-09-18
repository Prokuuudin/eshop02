"use client";
import React from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/use-translation'
import { COMPANY_CONTACT_LINES } from '@/data/company'
import { resolveLocaleText } from '@/lib/locale-text'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type FooterPromo = { title: string; link: string }

const safeExternalUrl = (value: string, fallback: string): string => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : fallback
  } catch {
    return fallback
  }
}

export default function Footer({ initialPromo = null }: { initialPromo?: FooterPromo | null }): React.ReactElement {
  const { t, language } = useTranslation()
  const promo = initialPromo

  const cookieLabel = t('footer.cookies')
  const cookieSettingsLabel = t('footer.cookieSettings')

  const promoTitle = promo ? resolveLocaleText(promo.title, language) : ''

  return (
    <footer className="footer bg-gray-200 dark:bg-gray-800 border-t border-border text-gray-800 dark:text-gray-300">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:py-10">
        <div className="footer__grid flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:gap-8 lg:gap-10 lg:justify-between">
          <div className="footer__section footer__nav min-w-[150px] flex-1 flex-shrink flex-basis-0 break-words">
            <h2 className="footer__title font-semibold mb-3 text-foreground">{t('footer.about')}</h2>
            <ul className="footer__list space-y-2">
              <li className="footer__item"><Link href="/catalog" className="hover:underline text-gray-800 dark:text-gray-300">{t('nav.catalog')}</Link></li>
              <li className="footer__item"><Link href="/#brands" className="hover:underline text-gray-800 dark:text-gray-300">{t('nav.brands')}</Link></li>
              {promo && (
                <li className="footer__item"><Link href={promo.link} className="hover:underline text-gray-800 dark:text-gray-300">{promoTitle}</Link></li>
              )}
              <li className="footer__item"><Link href="/delivery" className="hover:underline text-gray-800 dark:text-gray-300">{t('deliveryPayment.deliveryTitle')}</Link></li>
              <li className="footer__item"><Link href="/payment" className="hover:underline text-gray-800 dark:text-gray-300">{t('deliveryPayment.paymentTitle')}</Link></li>
              <li className="footer__item"><Link href="/blog" className="hover:underline text-gray-800 dark:text-gray-300">{t('nav.blog')}</Link></li>
              <li className="footer__item"><Link href="/terms" className="hover:underline text-gray-800 dark:text-gray-300">{t('terms.title')}</Link></li>
            </ul>
          </div>

          <div className="footer__section footer__contacts min-w-[150px] flex-1 flex-shrink flex-basis-0 break-words">
            <h2 className="footer__title font-semibold mb-3 text-foreground">{t('footer.contact')}</h2>
            <address className="not-italic text-sm text-gray-800 dark:text-gray-300 space-y-1">
            {COMPANY_CONTACT_LINES.map(({ labelKey, contentKey, value }) => (
                <div key={labelKey} className="footer__contact-item">{t(labelKey)}: {t(contentKey, value)}</div>
              ))}
            </address>
          </div>

          <div className="footer__section footer__policy min-w-[150px] flex-1 flex-shrink flex-basis-0 break-words">
            <h2 className="footer__title font-semibold mb-3 text-foreground">{t('footer.privacy')}</h2>
            <ul className="footer__policy-list space-y-2 text-sm">
              <li className="footer__policy-item"><Link href="/privacy" className="hover:underline text-gray-800 dark:text-gray-300">{t('footer.privacy')}</Link></li>
              <li className="footer__policy-item"><Link href="/terms" className="hover:underline text-gray-800 dark:text-gray-300">{t('footer.terms')}</Link></li>
              <li className="footer__policy-item"><Link href="/cookies" className="hover:underline text-gray-800 dark:text-gray-300">{cookieLabel}</Link></li>
              <li className="footer__policy-item">
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('eshop-open-cookie-settings'))}
                  className="hover:underline text-gray-800 dark:text-gray-300"
                >
                  {cookieSettingsLabel}
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer__bottom mt-6 flex flex-col items-start gap-2 border-t border-border pt-4 text-sm text-gray-700 dark:text-gray-300 sm:mt-8 sm:gap-3">
          <div className="footer__copyright min-w-0 text-left">© {new Date().getFullYear()} Hairshop-Pro. {t('footer.allRightsReserved')}</div>
          <TooltipProvider>
            <div className="footer__socials flex shrink-0 items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <a href={safeExternalUrl(t('footer.instagramUrl', 'https://www.instagram.com/miksplusveikals'), 'https://www.instagram.com/miksplusveikals')} target="_blank" rel="noopener noreferrer" aria-label={t('footer.instagram')} className="rounded-md p-2 text-brand transition-colors hover:bg-black/5 hover:text-pink-600 dark:text-white dark:hover:bg-white/10 dark:hover:text-pink-400">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect width="18" height="18" x="3" y="3" rx="5" strokeWidth="1.5"/><circle cx="12" cy="12" r="4" strokeWidth="1.5"/><circle cx="17" cy="7" r="1" fill="currentColor" stroke="none"/></svg>
                  </a>
                </TooltipTrigger>
                <TooltipContent>{t('footer.instagram')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a href={safeExternalUrl(t('footer.facebookUrl', 'https://www.facebook.com/share/1E9VE5FpA7/'), 'https://www.facebook.com/share/1E9VE5FpA7/')} target="_blank" rel="noopener noreferrer" aria-label={t('footer.facebook')} className="rounded-md p-2 text-brand transition-colors hover:bg-black/5 hover:text-blue-600 dark:text-white dark:hover:bg-white/10 dark:hover:text-blue-400">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect width="18" height="18" x="3" y="3" rx="5" strokeWidth="1.5"/><path d="M15 8h-2a1 1 0 0 0-1 1v2h3l-.5 2H12v6h-2v-6H8v-2h2V9a3 3 0 0 1 3-3h2v2z" fill="currentColor" stroke="none"/></svg>
                  </a>
                </TooltipTrigger>
                <TooltipContent>{t('footer.facebook')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a href={safeExternalUrl(t('footer.tiktokUrl', 'https://www.tiktok.com/@miks_plus'), 'https://www.tiktok.com/@miks_plus')} target="_blank" rel="noopener noreferrer" aria-label={t('footer.tiktok')} className="rounded-md p-2 text-brand transition-colors hover:bg-black/5 hover:text-black dark:text-white dark:hover:bg-white/10 dark:hover:text-white">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect width="18" height="18" x="3" y="3" rx="5" strokeWidth="1.5"/><path fillRule="evenodd" clipRule="evenodd" d="M9 0H10V1C10 3.20914 11.7909 5 14 5V6C12.3644 6 10.9122 5.21466 10 4.00049V11C10 13.2091 8.20914 15 6 15C3.79086 15 2 13.2091 2 11C2 8.79086 3.79086 7 6 7V8C4.34315 8 3 9.34315 3 11C3 12.6569 4.34315 14 6 14C7.65685 14 9 12.6569 9 11V0Z" transform="translate(6.15 6.15) scale(0.78)" fill="currentColor" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round"/></svg>
                  </a>
                </TooltipTrigger>
                <TooltipContent>{t('footer.tiktok')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a href={safeExternalUrl(t('footer.youtubeUrl', 'https://youtube.com/@miksplus'), 'https://youtube.com/@miksplus')} target="_blank" rel="noopener noreferrer" aria-label={t('footer.youtube')} className="rounded-md p-2 text-brand transition-colors hover:bg-black/5 hover:text-red-600 dark:text-white dark:hover:bg-white/10 dark:hover:text-red-400">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect width="18" height="18" x="3" y="3" rx="5" strokeWidth="1.5"/><polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none"/></svg>
                  </a>
                </TooltipTrigger>
                <TooltipContent>{t('footer.youtube')}</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>
    </footer>
  )
}
