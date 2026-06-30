"use client";
import React from 'react'
import Image from 'next/image'
import { useTranslation } from '@/lib/use-translation'
import { useSiteContent } from '@/lib/use-site-content'
import { useBrandsConfig } from '@/lib/use-brands-config'
import Link from 'next/link';
import BrandCardSkeleton from './BrandCardSkeleton';

const PALETTE = [
  'bg-rose-50', 'bg-orange-50', 'bg-amber-50', 'bg-yellow-50', 'bg-lime-50',
  'bg-green-50', 'bg-teal-50', 'bg-cyan-50', 'bg-sky-50', 'bg-blue-50',
  'bg-primary/5', 'bg-violet-50', 'bg-purple-50', 'bg-fuchsia-50', 'bg-pink-50',
];

function buildColorSequence(count: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const prev = result[i - 1];
    for (let j = 0; j < PALETTE.length; j++) {
      const candidate = PALETTE[(i + j) % PALETTE.length];
      if (candidate !== prev) {
        result.push(candidate);
        break;
      }
    }
  }
  return result;
}

export default function Brands() {
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

  const COLORS = React.useMemo(
    () => buildColorSequence(Object.keys(GROUPED).length),
    [GROUPED]
  );

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

        {!showAll && (
          <button
            className="mb-6 text-sm text-primary hover:underline sm:text-base"
            onClick={() => setShowAll(true)}
          >
            {t('brands.showAll')}
          </button>
        )}

        {showAll && (
          <>
            <div className="mb-4 flex items-baseline gap-3 sm:mb-5">
              <h2 className="brands__title text-xl font-semibold sm:text-2xl">{t('brands.alphabeticalTitle')}</h2>
              <button
                className="text-sm text-primary hover:underline sm:text-base"
                onClick={() => setShowAll(false)}
              >
                {t('brands.hide')}
              </button>
            </div>
            <div className="brands__alphabetical rounded-lg bg-white p-4 sm:p-6">
              <div className="flex flex-wrap gap-3">
                {Object.entries(GROUPED).map(([letter, letterBrands], index) => (
                  <div key={letter} className={`brands__letter-group flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2 ${COLORS[index]}`}>
                    <span className="brands__letter text-2xl font-bold text-gray-800 sm:text-3xl">{letter}</span>
                    {letterBrands.map((brand) => (
                      <Link
                        key={brand.id}
                        href={`/catalog?brand=${encodeURIComponent(brand.id)}`}
                        className="inline-block rounded border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-700 transition-all duration-200 hover:border-primary/50 hover:text-primary hover:scale-110 sm:text-base"
                        title={brand.name}
                      >
                        {brand.name}
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </div>
    </section>
  );
}
