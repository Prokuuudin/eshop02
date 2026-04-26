"use client";
import { FadeTransition } from './FadeTransition';
import React from 'react'
import Image from 'next/image'
import { useTranslation } from '@/lib/use-translation'
import { useSiteContent } from '@/lib/use-site-content'
import { useBrandsConfig } from '@/lib/use-brands-config'
import Link from 'next/link';
import BrandCardSkeleton from './BrandCardSkeleton';
import { IconClose } from './ui/icon-close';
import { Button } from './ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogClose } from './ui/dialog';

export default function Brands() {
  const { t, language } = useTranslation();
  const { resolveImageSrc } = useSiteContent();
  const { brands } = useBrandsConfig();
  const [showAll, setShowAll] = React.useState(false);
  const [alphabeticalView, setAlphabeticalView] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const POPULAR = brands ? brands.filter(b => b.popular) : [];
  const HIDDEN = brands ? brands.filter(b => !b.popular) : [];
  const ALPHABETICAL = React.useMemo(
    () => [...brands].sort((a, b) => a.name.localeCompare(b.name, language)),
    [brands, language]
  );
  const getBrandDescription = (brandId: string, brandName: string): string => {
    const desc = brands.find((entry) => entry.id === brandId)?.description;
    if (desc && typeof desc === 'object') {
      return desc[language] || desc.en || desc.ru || t('brands.descriptionTemplate', 'Products of brand {brand}.', { brand: brandName });
    }
    return t('brands.descriptionTemplate', 'Products of brand {brand}.', { brand: brandName });
  };

  React.useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <section className="brands py-6 sm:py-8" id="brands">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="mb-4 sm:mb-5">
          <h2 className="brands__title text-xl font-semibold sm:text-2xl">{t('brands.popular')}</h2>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3 sm:gap-4">
          {!alphabeticalView &&
            (showAll ? (
              <button className="text-sm text-indigo-600 hover:underline sm:text-base" onClick={() => setShowAll(false)}>
                {t('brands.hideAll')}
              </button>
            ) : (
              <button className="text-sm text-indigo-600 hover:underline sm:text-base" onClick={() => setShowAll(true)}>
                {t('brands.showAll')}
              </button>
            ))}
          <button
            className="text-sm text-indigo-600 hover:underline sm:text-base"
            onClick={() => setAlphabeticalView((prev) => !prev)}
          >
            {alphabeticalView ? t('brands.viewCards') : t('brands.viewAlphabetical')}
          </button>
        </div>
        {alphabeticalView ? (
          <div className="rounded-lg bg-white p-4 sm:p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 sm:text-xl">{t('brands.alphabeticalTitle')}</h3>
            <ul className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 sm:gap-x-6 md:grid-cols-4 lg:grid-cols-5">
              {ALPHABETICAL.map((brand) => (
                <li key={brand.id}>
                  <Dialog>
                    <DialogTrigger asChild>
                      <button className="text-left text-sm font-medium text-gray-700 hover:text-indigo-700 hover:underline sm:text-base" title={brand.name}>
                        {brand.name}
                      </button>
                    </DialogTrigger>
                    <DialogContent className="!left-3 !right-3 !w-auto !max-w-none !translate-x-0 rounded-lg min-h-[60vh] max-h-[92vh] overflow-y-auto p-3 sm:!left-1/2 sm:!right-auto sm:!w-full sm:!max-w-lg sm:!-translate-x-1/2 sm:p-6">
                      <DialogHeader>
                        <div className="flex w-full items-start justify-between gap-2">
                          <DialogTitle className="min-w-0 break-words text-base font-semibold leading-tight tracking-tight text-gray-900 sm:text-lg">
                            {brand.name}
                          </DialogTitle>
                          <DialogClose asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Close"
                              className="ml-2 h-8 w-8 shrink-0 rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-700 sm:h-9 sm:w-9"
                              style={{ boxShadow: '0 0 0 4px rgba(107,114,128,0.15)' }}
                            >
                              <IconClose className="h-4 w-4" />
                            </Button>
                          </DialogClose>
                        </div>
                      </DialogHeader>
                      <div className="flex flex-col items-center">
                        <div className="relative mb-4 flex h-12 w-24 items-center justify-center sm:h-14 sm:w-28">
                          <Image src={resolveImageSrc(brand.logo)} alt={brand.name} fill className="object-contain" />
                        </div>
                        <p className="mb-4 text-center text-sm text-gray-600 sm:text-base">{getBrandDescription(brand.id, brand.name)}</p>
                        <div className="mt-2 flex w-full justify-center">
                          <Link
                            href={`/catalog?brand=${encodeURIComponent(brand.id)}`}
                            className="inline-flex w-full justify-center rounded bg-indigo-50 px-4 py-2 text-sm text-indigo-700 transition hover:bg-indigo-100 sm:w-auto sm:text-base"
                          >
                            {t('brands.viewAllProducts')}
                          </Link>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
        <div className={`brands__grid grid grid-cols-2 gap-2 bg-white p-3 sm:grid-cols-4 sm:gap-3 sm:p-5 md:grid-cols-5 lg:grid-cols-6 ${showAll ? 'rounded-t-lg' : 'rounded-lg'}`}>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <BrandCardSkeleton key={i} />)
            : POPULAR.map((brand) => (
                <Dialog key={brand.id}>
                  <DialogTrigger asChild>
                    <button
                      className="brands__item group flex h-full w-full cursor-pointer flex-col items-center justify-center border bg-white px-2 py-3 transition-all hover:shadow-lg sm:px-3 sm:py-4"
                      title={brand.name}
                    >
                      <div className="brands__logo relative flex h-10 w-20 items-center justify-center transition-transform duration-300 group-hover:translate-y-1 sm:h-12 sm:w-24 md:h-14 md:w-28">
                        <Image src={resolveImageSrc(brand.logo)} alt={brand.name} fill className="object-contain" />
                      </div>
                    </button>
                  </DialogTrigger>
                  <DialogContent className="!left-3 !right-3 !w-auto !max-w-none !translate-x-0 rounded-lg min-h-[60vh] max-h-[92vh] overflow-y-auto p-3 sm:!left-1/2 sm:!right-auto sm:!w-full sm:!max-w-lg sm:!-translate-x-1/2 sm:p-6">
                    <DialogHeader className="relative">
                      <div className="flex w-full items-start justify-between gap-2">
                        <DialogTitle className="min-w-0 break-words text-base font-semibold leading-tight tracking-tight text-gray-900 sm:text-lg">
                          {brand.name}
                        </DialogTitle>
                        <DialogClose asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Close"
                            className="ml-2 h-8 w-8 shrink-0 rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-700 sm:h-9 sm:w-9"
                            style={{ boxShadow: '0 0 0 4px rgba(107,114,128,0.15)' }}
                          >
                            <IconClose className="h-4 w-4" />
                          </Button>
                        </DialogClose>
                      </div>
                    </DialogHeader>
                    <div className="flex flex-col items-center">
                      <div className="relative mb-4 flex h-12 w-24 items-center justify-center sm:h-14 sm:w-28">
                        <Image src={resolveImageSrc(brand.logo)} alt={brand.name} fill className="object-contain" />
                      </div>
                      <p className="mb-4 text-center text-sm text-gray-600 sm:text-base">{getBrandDescription(brand.id, brand.name)}</p>
                      <div className="mt-2 flex w-full justify-center">
                        <Link
                          href={`/catalog?brand=${encodeURIComponent(brand.id)}`}
                          className="inline-flex w-full justify-center rounded bg-indigo-50 px-4 py-2 text-sm text-indigo-700 transition hover:bg-indigo-100 sm:w-auto sm:text-base"
                        >
                          {t('brands.viewAllProducts')}
                        </Link>
                      </div>
                    </div>
                    {/* Close button removed, cross icon used instead */}
                  </DialogContent>
                </Dialog>
              ))}
        </div>

        <FadeTransition show={showAll} duration={300}>
          <div className={`brands__grid grid grid-cols-2 gap-2 bg-white p-3 sm:grid-cols-4 sm:gap-3 sm:p-5 md:grid-cols-5 lg:grid-cols-6 ${showAll ? 'rounded-b-lg' : 'rounded-lg'}`}>
            {HIDDEN.map((brand) => (
              <Dialog key={brand.id}>
                <DialogTrigger asChild>
                  <button
                    className="brands__item group flex h-full w-full cursor-pointer flex-col items-center justify-center border bg-white px-2 py-3 transition-all hover:shadow-lg sm:px-3 sm:py-4"
                    title={brand.name}
                  >
                    <div className="brands__logo relative flex h-10 w-20 items-center justify-center transition-transform duration-300 group-hover:translate-y-1 sm:h-12 sm:w-24 md:h-14 md:w-28">
                      <Image src={resolveImageSrc(brand.logo)} alt={brand.name} fill className="object-contain" />
                    </div>
                  </button>
                </DialogTrigger>
                <DialogContent className="!left-3 !right-3 !w-auto !max-w-none !translate-x-0 rounded-lg min-h-[60vh] max-h-[92vh] overflow-y-auto p-3 sm:!left-1/2 sm:!right-auto sm:!w-full sm:!max-w-lg sm:!-translate-x-1/2 sm:p-6">
                  <DialogHeader>
                    <div className="flex w-full items-start justify-between gap-2">
                      <DialogTitle className="min-w-0 break-words text-base font-semibold leading-tight tracking-tight text-gray-900 sm:text-lg">
                        {brand.name}
                      </DialogTitle>
                      <DialogClose asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Close"
                          className="ml-2 h-8 w-8 shrink-0 rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-700 sm:h-9 sm:w-9"
                          style={{ boxShadow: '0 0 0 4px rgba(107,114,128,0.15)' }}
                        >
                          <IconClose className="h-4 w-4" />
                        </Button>
                      </DialogClose>
                    </div>
                  </DialogHeader>
                  <div className="flex flex-col items-center">
                    <div className="relative mb-4 flex h-12 w-24 items-center justify-center sm:h-14 sm:w-28">
                      <Image src={resolveImageSrc(brand.logo)} alt={brand.name} fill className="object-contain" />
                    </div>
                    <p className="mb-4 text-center text-sm text-gray-600 sm:text-base">{getBrandDescription(brand.id, brand.name)}</p>
                    <div className="mt-2 flex w-full justify-center">
                      <Link
                        href={`/catalog?brand=${encodeURIComponent(brand.id)}`}
                        className="inline-flex w-full justify-center rounded bg-indigo-50 px-4 py-2 text-sm text-indigo-700 transition hover:bg-indigo-100 sm:w-auto sm:text-base"
                      >
                        {t('brands.viewAllProducts')}
                      </Link>
                    </div>
                  </div>
                  {/* Close button replaced by cross in header */}
                </DialogContent>
              </Dialog>
            ))}
          </div>
        </FadeTransition>
          </>
        )}
      </div>
    </section>
  );
}
