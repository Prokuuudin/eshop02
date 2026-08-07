"use client";
import React from 'react'
import Image from 'next/image'
import { useTranslation } from '@/lib/use-translation'
import { useSiteContent } from '@/lib/use-site-content'
import { useBrandsConfig } from '@/lib/use-brands-config'
import Link from 'next/link';
import BrandCardSkeleton from './BrandCardSkeleton';
import { Button } from '@/components/ui/button';

const COLLAPSED_MAX_HEIGHT = 240;

const LETTER_PALETTE = [
  'bg-rose-50', 'bg-orange-50', 'bg-amber-50', 'bg-yellow-50', 'bg-lime-50',
  'bg-green-50', 'bg-teal-50', 'bg-cyan-50', 'bg-sky-50', 'bg-blue-50',
  'bg-primary/5', 'bg-violet-50', 'bg-purple-50', 'bg-fuchsia-50', 'bg-pink-50',
];

function toBrandTitleCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s\-.'])([a-zа-яё])/gi, (_m, sep, chr) => sep + chr.toUpperCase());
}

export default function Brands(): React.ReactElement {
  const { t, language } = useTranslation();
  const { resolveImageSrc } = useSiteContent();
  const { brands } = useBrandsConfig();
  const [loading, setLoading] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);

  const DISTRIBUTOR_BRANDS = brands ? brands.filter(b => b.isDistributor) : [];

  const GROUPED = React.useMemo(() => {
    const sorted = [...brands].sort((a, b) => a.name.localeCompare(b.name, language));
    const groups: Record<string, typeof brands> = {};
    for (const brand of sorted) {
      const letter = brand.name[0].toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(brand);
    }
    return groups;
  }, [brands, language]);

  const GROUP_ENTRIES = React.useMemo(() => Object.entries(GROUPED), [GROUPED]);

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [hasOverflow, setHasOverflow] = React.useState(false);
  const [maxHeight, setMaxHeight] = React.useState<number | 'none'>(COLLAPSED_MAX_HEIGHT);

  React.useEffect(() => {
    const measure = () => {
      const el = listRef.current;
      if (!el) return;
      setHasOverflow(el.scrollHeight > COLLAPSED_MAX_HEIGHT + 1);
      if (showAll) setMaxHeight(el.scrollHeight);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [brands, language, showAll]);

  const handleToggle = () => {
    const el = listRef.current;
    if (!el) { setShowAll((prev) => !prev); return; }
    if (!showAll) {
      setMaxHeight(el.scrollHeight);
      setShowAll(true);
    } else {
      setMaxHeight(el.scrollHeight);
      requestAnimationFrame(() => setMaxHeight(COLLAPSED_MAX_HEIGHT));
      setShowAll(false);
    }
  };

  const handleListTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName === 'max-height' && showAll) setMaxHeight('none');
  };

  React.useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <section className="brands pt-6" id="brands">
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">

        <div className="mb-4 sm:mb-5">
          <h2 className="brands__title text-xl font-semibold sm:text-2xl">{t('brands.popular')}</h2>
        </div>
        <div className="brands__grid mb-4 grid grid-cols-2 gap-2 rounded-lg bg-white p-3 sm:grid-cols-4 sm:gap-3 sm:p-5 md:grid-cols-5 lg:grid-cols-6">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <BrandCardSkeleton key={i} />)
            : DISTRIBUTOR_BRANDS.map((brand) => (
                <Link
                  key={brand.id}
                  href={`/catalog?brand=${encodeURIComponent(brand.id)}`}
                  className="brands__item group flex h-full w-full flex-col items-center justify-center border bg-white px-2 py-3 transition-all hover:shadow-lg sm:px-3 sm:py-4"
                  title={brand.name}
                >
                  <div className="brands__logo relative flex h-10 w-20 items-center justify-center transition-transform duration-300 group-hover:translate-y-1 sm:h-12 sm:w-24 md:h-14 md:w-28">
                    <Image src={resolveImageSrc(brand.logo)} alt={brand.name} fill className="object-contain" />
                  </div>
                </Link>
              ))}
        </div>

        {GROUP_ENTRIES.length > 0 && (
          <>
            <div className="mb-4 sm:mb-5">
              <h2 className="brands__title text-xl font-semibold sm:text-2xl">
                {t('brands.alphabeticalTitle')}{' '}
                <span className="brands__count font-normal text-muted-foreground">({brands.length})</span>
              </h2>
            </div>
            <div className="brands__alphabetical rounded-lg bg-white p-4 sm:p-6">
              <div className="brands__list-clip relative">
                <div
                  ref={listRef}
                  onTransitionEnd={handleListTransitionEnd}
                  className="brands__list flex flex-wrap gap-x-6 gap-y-3 overflow-hidden transition-[max-height] duration-500 ease-in-out"
                  style={{ maxHeight: maxHeight === 'none' ? 'none' : `${maxHeight}px` }}
                >
                  {GROUP_ENTRIES.map(([letter, letterBrands], index) => (
                    <div key={letter} className="brands__letter-group flex flex-wrap items-center gap-x-2 gap-y-2">
                      <span className={`brands__letter inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg font-bold text-gray-800 ${LETTER_PALETTE[index % LETTER_PALETTE.length]}`}>{letter}</span>
                      {letterBrands.map((brand) => (
                        <Link
                          key={brand.id}
                          href={`/catalog?brand=${encodeURIComponent(brand.id)}`}
                          className="brands__brand-link inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm font-medium text-gray-700 transition-colors duration-200 hover:border-gray-400 hover:bg-gray-100 hover:text-gray-900 sm:text-base"
                          title={brand.name}
                        >
                          {toBrandTitleCase(brand.name)}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
                {hasOverflow && (
                  <div
                    aria-hidden="true"
                    className={`brands__fade pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white via-white/70 to-transparent backdrop-blur-[2px] [mask-image:linear-gradient(to_top,black_45%,transparent)] transition-opacity duration-500 ease-in-out ${showAll ? 'opacity-0' : 'opacity-100'}`}
                  />
                )}
              </div>
              {hasOverflow && (
                <div className={`brands__toggle-row relative flex justify-center transition-[margin] duration-500 ease-in-out ${showAll ? 'mt-4' : '-mt-6'}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="brands__toggle"
                    aria-expanded={showAll}
                    onClick={handleToggle}
                  >
                    {showAll ? t('brands.hide') : t('brands.more')}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </section>
  );
}
