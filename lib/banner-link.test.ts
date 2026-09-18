import { describe, expect, it } from 'vitest';
import { resolveBannerLink } from './banner-link';

describe('banner links', () => {
  it('keeps a published shop link on the current site', () => {
    expect(resolveBannerLink('https://eshop02.vercel.app/catalog?search=beauty%20image', 'ru')).toBe('/catalog?search=beauty%20image');
  });
  it('preserves query and hash and uses the current language', () => {
    expect(resolveBannerLink('https://eshop02.vercel.app/en/catalog?onSale=1#products', 'lv')).toBe('/lv/catalog?onSale=1#products');
  });
  it('preserves external links and empty links', () => {
    expect(resolveBannerLink('https://example.com/catalog', 'ru')).toBe('https://example.com/catalog');
    expect(resolveBannerLink('', 'ru')).toBe('');
  });
});
