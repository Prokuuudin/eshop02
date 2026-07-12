"use client";
import React from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/use-translation'
import { sanitizeStoredLink } from '@/lib/safe-link'

type FooterPromo = { title: string; link: string }

export default function Footer() {
  const { t } = useTranslation()
  const [promo, setPromo] = React.useState<FooterPromo | null>(null)

  React.useEffect(() => {
    fetch('/api/banners?type=sale')
      .then((r) => r.json())
      .then((d) => {
        const banner = d.banners?.[0]
        if (!banner?.title) return
        setPromo({ title: banner.title, link: sanitizeStoredLink(banner.link) || '/catalog' })
      })
      .catch(() => {})
  }, [])

  return (
    <footer className="footer bg-slate-50 dark:bg-gray-900 border-t border-border text-gray-800 dark:text-gray-300">
      <div className="max-w-7xl mx-auto w-full px-4 py-10">
        <div className="footer__grid flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:gap-8 lg:gap-10 lg:justify-between">
          <div className="footer__section footer__nav min-w-[150px] flex-1 flex-shrink flex-basis-0 break-words">
            <h4 className="footer__title font-semibold mb-3 text-foreground">{t('footer.about')}</h4>
            <ul className="footer__list space-y-2">
              <li className="footer__item"><Link href="/catalog" className="hover:underline text-gray-800 dark:text-gray-300">{t('nav.catalog')}</Link></li>
              <li className="footer__item"><Link href="/#brands" className="hover:underline text-gray-800 dark:text-gray-300">{t('nav.brands')}</Link></li>
              {promo && (
                <li className="footer__item"><Link href={promo.link} className="hover:underline text-gray-800 dark:text-gray-300">{promo.title}</Link></li>
              )}
              <li className="footer__item"><Link href="/delivery-payment" className="hover:underline text-gray-800 dark:text-gray-300">{t('deliveryPayment.title')}</Link></li>
              <li className="footer__item"><Link href="/blog" className="hover:underline text-gray-800 dark:text-gray-300">{t('nav.blog')}</Link></li>
            </ul>
          </div>

          <div className="footer__section footer__contacts min-w-[150px] flex-1 flex-shrink flex-basis-0 break-words">
            <h4 className="footer__title font-semibold mb-3 text-foreground">{t('footer.contact')}</h4>
            <address className="not-italic text-sm text-gray-800 dark:text-gray-300 space-y-1">
              <div className="footer__contact-item">{t('footer.legalAddressLabel')}: {t('contact.street')}, {t('contact.city')}, {t('contact.country')}, {t('contact.postalCode')}</div>
              <div className="footer__contact-item">{t('footer.vatLabel')}: LV 40103351370</div>
              <div className="footer__contact-item">AS Swedbank, SWIFT: HABALV22</div>
              <div className="footer__contact-item">{t('footer.bankAccountLabel')}: LV66HABA0551036604107</div>
              <div className="footer__contact-item">{t('footer.officeAddressLabel')}: {t('contact.country')}, {t('contact.city')}, {t('contact.street')}</div>
              <div className="footer__contact-item">{t('footer.phoneLabel')}: +37127067730</div>
              <div className="footer__contact-item">{t('footer.emailLabel')}: Info@HairShop.lv</div>
            </address>
          </div>

          <div className="footer__section footer__policy min-w-[150px] flex-1 flex-shrink flex-basis-0 break-words">
            <h4 className="footer__title font-semibold mb-3 text-foreground">{t('footer.privacy')}</h4>
            <ul className="footer__policy-list space-y-2 text-sm">
              <li className="footer__policy-item"><Link href="/privacy" className="hover:underline text-gray-800 dark:text-gray-300">{t('footer.privacy')}</Link></li>
              <li className="footer__policy-item"><Link href="/terms" className="hover:underline text-gray-800 dark:text-gray-300">{t('footer.terms')}</Link></li>
            </ul>
          </div>
        </div>

        <div className="footer__bottom mt-8 border-t border-border pt-4 text-center text-sm text-muted-foreground">
          <div className="footer__copyright">© {new Date().getFullYear()} Eshop. {t('footer.returns')}</div>
        </div>
      </div>
    </footer>
  )
}
