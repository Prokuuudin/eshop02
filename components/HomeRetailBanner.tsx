'use client';

import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/use-translation';

const RETAIL_STORE_URL = 'https://hairshop.lv';

export default function HomeRetailBanner() {
    const { t } = useTranslation();

    return (
        <section className="retail-banner px-4 py-4 sm:py-6">
            <div className="retail-banner__container mx-auto w-full max-w-7xl overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-rose-50 p-5 shadow-sm dark:border-amber-900/60 dark:from-amber-950/40 dark:via-gray-900 dark:to-rose-950/30 sm:p-6">
                <div className="retail-banner__layout flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="retail-banner__content max-w-3xl">
                        <p className="retail-banner__eyebrow text-xs font-semibold uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">
                            {t('home.retailBanner.eyebrow')}
                        </p>
                        <p className="retail-banner__desc mt-2 text-lg font-medium text-gray-900 dark:text-gray-100 sm:text-xl">
                            {t(
                                'home.retailBanner.retailOnly',
                                'Вы можете приобрести те же товары по розничным ценам — в нашем интернет-магазине'
                            )}
                        </p>
                    </div>

                    <Button asChild size="lg" className="retail-banner__button w-full lg:w-auto">
                        <a href={RETAIL_STORE_URL} target="_blank" rel="noopener noreferrer">
                            {t('home.retailBanner.button')}
                        </a>
                    </Button>
                </div>
            </div>
        </section>
    );
}
