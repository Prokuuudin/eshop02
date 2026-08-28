import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getPrivacyContent } from '@/data/privacy-content'
import { resolveLanguage } from '@/lib/i18n-routing'
import { buildPublicPageMetadata } from '@/lib/page-metadata'
import { getServerContent } from '@/lib/server-translation'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const content = getPrivacyContent(language)
  const { t } = await getServerContent(language)

  const descriptions = {
    ru: 'Политика конфиденциальности Hairshop-Pro и информация об обработке персональных данных.',
    en: 'Hairshop-Pro privacy policy and information about personal data processing.',
    lv: 'Hairshop-Pro privātuma politika un informācija par personas datu apstrādi.',
  }
  return buildPublicPageMetadata({ language, path: '/privacy', title: t('legal.privacy.title', content.title), description: descriptions[language] })
}

export default function PrivacyLayout({ children }: LayoutProps): ReactNode {
  return children
}
