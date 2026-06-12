'use client';
import React from 'react';
import Link from 'next/link';
import { Star, CreditCard, TrendingUp } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';
import { useAdminStore } from '@/lib/admin-store';
import { getCurrentUser } from '@/lib/auth';

const STEPS = [
    {
        icon: Star,
        titleKey: 'bonus.section.step.earn.title',
        descKey: 'bonus.section.step.earn.desc',
        badgeKey: 'bonus.section.earnRate',
        badgeParam: 'rate' as const,
        badgeSource: 'earnRatePercent' as const,
    },
    {
        icon: CreditCard,
        titleKey: 'bonus.section.step.spend.title',
        descKey: 'bonus.section.step.spend.desc',
        badgeKey: 'bonus.section.maxSpend',
        badgeParam: 'rate' as const,
        badgeSource: 'maxSpendPercent' as const,
    },
    {
        icon: TrendingUp,
        titleKey: 'bonus.section.step.grow.title',
        descKey: 'bonus.section.step.grow.desc',
        badgeKey: null,
        badgeParam: null,
        badgeSource: null,
    },
] as const;

export default function BonusSection() {
    const { t } = useTranslation();
    const { bonusProgram } = useAdminStore();
    const currentUser = getCurrentUser();

    if (!bonusProgram.enabled) return null;

    return (
        <section className="bonus-section py-12 px-4">
            <div className="bonus-section__inner max-w-5xl mx-auto">

                {/* Header */}
                <div className="bonus-section__header text-center mb-10">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/40 mb-4">
                        <Star className="w-7 h-7 text-amber-500 fill-amber-400" />
                    </div>
                    <h2 className="bonus-section__title text-2xl sm:text-3xl font-bold text-foreground mb-3">
                        {t('bonus.section.title')}
                    </h2>
                    <p className="bonus-section__subtitle text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
                        {t('bonus.section.subtitle')}
                    </p>
                </div>

                {/* Steps */}
                <div className="bonus-section__steps grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
                    {STEPS.map((step, idx) => {
                        const Icon = step.icon;
                        const badge =
                            step.badgeKey && step.badgeSource
                                ? t(step.badgeKey, undefined, {
                                      [step.badgeParam]: bonusProgram[step.badgeSource],
                                  })
                                : null;

                        return (
                            <div
                                key={idx}
                                className="bonus-section__step relative rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-6 flex flex-col gap-3"
                            >
                                {/* Step number */}
                                <span className="bonus-section__step-number absolute top-4 right-4 text-xs font-bold text-amber-300 dark:text-amber-700 select-none">
                                    {idx + 1}
                                </span>

                                <div className="bonus-section__step-icon w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                                    <Icon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                </div>

                                <h3 className="bonus-section__step-title font-semibold text-foreground">
                                    {t(step.titleKey)}
                                </h3>

                                <p className="bonus-section__step-desc text-sm text-muted-foreground leading-relaxed">
                                    {t(step.descKey)}
                                </p>

                                {badge && (
                                    <span className="bonus-section__step-badge mt-auto inline-block self-start rounded-full bg-amber-200 dark:bg-amber-800/60 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-200">
                                        {badge}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* CTA — только для неавторизованных */}
                {!currentUser && (
                    <div className="bonus-section__cta text-center">
                        <Link
                            href="/account"
                            className="bonus-section__cta-btn inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700 text-white font-semibold px-7 py-3 transition-colors text-sm shadow-sm"
                        >
                            <Star className="w-4 h-4 fill-white" />
                            {t('bonus.section.cta')}
                        </Link>
                    </div>
                )}
            </div>
        </section>
    );
}
