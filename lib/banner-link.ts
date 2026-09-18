import type { Language } from '@/data/translations';
import { localizePath, stripLangPrefix } from './i18n-routing';

export function resolveBannerLink(link: string, language: Language): string {
  if (!link) return '';
  let path = link;
  if (/^(https?:)?\/\//i.test(link)) {
    try {
      const url = new URL(link, 'https://eshop02.vercel.app');
      const siteHosts = new Set(['eshop02.vercel.app', 'hairshoppro.lv', 'www.hairshoppro.lv']);
      const configuredSite = process.env.NEXT_PUBLIC_SITE_URL;
      if (configuredSite) siteHosts.add(new URL(configuredSite).hostname);
      if (!siteHosts.has(url.hostname)) return link;
      path = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return link;
    }
  }
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  return localizePath(stripLangPrefix(path).path, language);
}
