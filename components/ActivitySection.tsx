'use client';

import * as React from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';

type Activity = {
    key: string;
    titleKey: string;
    descKey: string;
    images: string[];
};

const activities: Activity[] = [
    {
        key: 'exhibitions',
        titleKey: 'activitySection.exhibitions.title',
        descKey: 'activitySection.exhibitions.desc',
        images: ['/activity/exhibitions1.jpg', '/activity/exhibitions2.jpg'],
    },
    {
        key: 'seminars',
        titleKey: 'activitySection.seminars.title',
        descKey: 'activitySection.seminars.desc',
        images: ['/activity/seminars1.jpg', '/activity/seminars2.jpg'],
    },
    {
        key: 'sponsorship',
        titleKey: 'activitySection.sponsorship.title',
        descKey: 'activitySection.sponsorship.desc',
        images: ['/activity/sponsorship1.jpg', '/activity/sponsorship2.jpg'],
    },
];

const FALLBACK_GRADIENTS = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
];

function ActivitySlider({ activity, index }: { activity: Activity; index: number }) {
    const { t } = useTranslation();
    const [current, setCurrent] = React.useState(0);
    const [imgError, setImgError] = React.useState<Record<number, boolean>>({});
    const total = activity.images.length;

    const prev = () => setCurrent((c) => (c - 1 + total) % total);
    const next = () => setCurrent((c) => (c + 1) % total);

    const src = activity.images[current];
    const hasError = imgError[current];
    const gradientIndex = (index * 2 + current) % FALLBACK_GRADIENTS.length;

    return (
        <Card className="activity-section__card flex flex-col p-6 shadow-md rounded-2xl bg-card text-card-foreground">
            <h3 className="activity-section__subtitle text-xl font-semibold mb-2 text-primary text-center">
                {t(activity.titleKey) || activity.key}
            </h3>
            <p className="activity-section__desc text-muted-foreground mb-4 text-center text-sm leading-relaxed">
                {t(activity.descKey)}
            </p>

            <div className="activity-section__slider relative w-full mt-auto">
                <div className="activity-section__slide relative w-full h-44 rounded-lg overflow-hidden">
                    {hasError ? (
                        <div
                            className="w-full h-full rounded-lg"
                            style={{ background: FALLBACK_GRADIENTS[gradientIndex] }}
                        />
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            key={src}
                            src={src}
                            alt={`${activity.key} ${current + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={() => setImgError((prev) => ({ ...prev, [current]: true }))}
                        />
                    )}
                </div>

                {total > 1 && (
                    <>
                        <button
                            onClick={prev}
                            aria-label="Предыдущее фото"
                            className="activity-section__prev absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={next}
                            aria-label="Следующее фото"
                            className="activity-section__next absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>

                        <div className="activity-section__dots flex justify-center gap-1.5 mt-2">
                            {activity.images.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setCurrent(i)}
                                    aria-label={`Фото ${i + 1}`}
                                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                        i === current
                                            ? 'bg-primary'
                                            : 'bg-muted-foreground/30'
                                    }`}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </Card>
    );
}

export default function ActivitySection() {
    const { t } = useTranslation();

    return (
        <section className="activity-section py-6 sm:py-8">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
                <h2 className="activity-section__title section__title text-3xl font-bold mb-8 text-center">
                    {t('activitySection.title') || 'Наша деятельность'}
                </h2>
                <div className="activity-section__list grid grid-cols-1 md:grid-cols-3 gap-8">
                    {activities.map((activity, i) => (
                        <ActivitySlider key={activity.key} activity={activity} index={i} />
                    ))}
                </div>

                <div className="activity-section__contact mt-12 p-6 bg-accent text-accent-foreground rounded-lg text-center shadow-sm">
                    <h3 className="activity-section__subtitle text-xl font-semibold mb-2">
                        {t('activitySection.contactTitle') || 'Связаться с нами'}
                    </h3>
                    <p className="activity-section__desc text-muted-foreground mb-4">
                        {t('activitySection.contactDesc') ||
                            'По вопросам сотрудничества, участия в мероприятиях или другим предложениям — свяжитесь с нашей командой.'}
                    </p>
                    <Button asChild size="lg" className="activity-section__btn">
                        <a href="/contact">{t('activitySection.contactBtn') || 'Связаться'}</a>
                    </Button>
                </div>
            </div>
        </section>
    );
}
