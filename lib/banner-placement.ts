export function splitBannersByPlacement<T extends { placement?: 'list' | 'carousel' }>(
  banners: T[]
): { listBanners: T[]; carouselBanners: T[] } {
  return {
    listBanners: banners.filter((banner) => banner.placement !== 'carousel'),
    carouselBanners: banners.filter((banner) => banner.placement === 'carousel'),
  }
}
