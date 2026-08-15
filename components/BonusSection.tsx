'use client';
import React from 'react';
import { Star, CreditCard, TrendingUp } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';
import { useAdminStore } from '@/lib/admin-store';

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
        badgeKey: 'expiry' as const,
        badgeParam: null,
        badgeSource: null,
    },
] as const;

export default function BonusSection(): React.ReactElement | null {
    const { t } = useTranslation();
    const { bonusProgram } = useAdminStore();

    if (!bonusProgram.enabled) return null;

    return (
        <section id="bonus" className="bonus-section px-4 pt-12 md:pt-16">
            <div className="bonus-section__inner max-w-[1200px] mx-auto">

                {/* Header */}
                <div className="bonus-section__header mb-4 text-center sm:mb-5">
                    <h2 className="bonus-section__title text-xl font-semibold sm:text-2xl">
                        {t('bonus.section.title')}
                    </h2>
                    <p className="bonus-section__subtitle mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                        {t('bonus.section.subtitle')}
                    </p>
                </div>

                {/* Steps */}
                <div className="bonus-section__steps grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
                    {STEPS.map((step, idx) => {
                        const Icon = step.icon;
                        const badge =
                            step.badgeKey === 'expiry'
                                ? bonusProgram.pointsExpiryDays > 0
                                    ? t('bonus.section.expiresIn', undefined, { days: bonusProgram.pointsExpiryDays })
                                    : t('bonus.section.neverExpire')
                                : step.badgeKey && step.badgeSource
                                ? t(step.badgeKey, undefined, {
                                      [step.badgeParam]: bonusProgram[step.badgeSource],
                                  })
                                : null;

                        return (
                            <div
                                key={idx}
                                className="bonus-section__step flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:p-6 shadow-sm"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="bonus-section__step-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand dark:bg-white">
                                        <Icon className="h-5 w-5 text-brand-foreground dark:text-brand" />
                                    </div>
                                    <h3 className="bonus-section__step-title font-semibold text-foreground">
                                        {t(step.titleKey)}
                                    </h3>
                                </div>

                                <p className="bonus-section__step-desc text-sm text-muted-foreground leading-relaxed">
                                    {t(step.descKey)}
                                </p>

                                {badge && (
                                    <span className="bonus-section__step-badge mt-auto inline-block self-start px-3 py-1 text-xs font-bold text-foreground">
                                        {badge}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>

            </div>
        </section>
    );
}
