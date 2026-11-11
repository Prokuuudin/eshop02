'use client'

import * as React from 'react'
import NextLink from 'next/link'
import { useParams } from 'next/navigation'
import { localizeInternalHref, resolveLanguage } from '@/lib/i18n-routing'

/**
 * next/link that keeps internal hrefs in the language of the current route.
 *
 * Components write unprefixed hrefs ('/catalog'). On /en and /lv pages proxy.ts answers
 * such a URL with a 307 to the prefixed one, and the App Router does not settle a
 * prefetch that ends in a redirect: visible links were re-prefetched without end
 * (~45 requests/s from one idle home tab in production). Prefetch stays enabled.
 */
const LocalizedLink = React.forwardRef<HTMLAnchorElement, React.ComponentPropsWithoutRef<typeof NextLink>>(
  function LocalizedLink({ href, ...props }, ref) {
    const params = useParams<{ lang?: string }>()
    const language = resolveLanguage(params?.lang)
    const localizedHref = typeof href === 'string' ? localizeInternalHref(href, language) : href
    return <NextLink ref={ref} href={localizedHref} {...props} />
  }
)

export default LocalizedLink
