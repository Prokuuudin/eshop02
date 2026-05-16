// Файл устарел. Компонент переименован в ActivitySection.tsx. Оставлен для истории.

// Удалите этот файл, если он больше не нужен.

import * as React from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { translations, type Language } from '@/data/translations';

type Activity = {
    key: string;
    title: string;
    description: string;
    images: string[];
};

const activities: Record<Language, Activity[]> = {
    ru: [
        {
            key: 'exhibitions',
            title: 'Выставки',
            description:
                'Мы регулярно участвуем в профессиональных выставках, представляя новинки и лучшие продукты.',
            images: ['/activity/exhibitions1.jpg', '/activity/exhibitions2.jpg'],
        },
        {
            key: 'seminars',
            title: 'Семинары',
            description:
                'Проводим обучающие семинары для мастеров и клиентов с участием ведущих экспертов.',
            images: ['/activity/seminars1.jpg', '/activity/seminars2.jpg'],
        },
        {
            key: 'sponsorship',
            title: 'Спонсорство',
            description:
                'Поддерживаем профессиональные мероприятия и конкурсы в индустрии красоты.',
            images: ['/activity/sponsorship1.jpg', '/activity/sponsorship2.jpg'],
        },
    ],
    en: [
        {
            key: 'exhibitions',
            title: 'Exhibitions',
            description:
                'We regularly participate in professional exhibitions, presenting new and best products.',
            images: ['/activity/exhibitions1.jpg', '/activity/exhibitions2.jpg'],
        },
        {
            key: 'seminars',
            title: 'Seminars',
            description:
                'We hold training seminars for professionals and clients with leading experts.',
            images: ['/activity/seminars1.jpg', '/activity/seminars2.jpg'],
        },
        {
            key: 'sponsorship',
            title: 'Sponsorship',
            description: 'We support professional events and competitions in the beauty industry.',
            images: ['/activity/sponsorship1.jpg', '/activity/sponsorship2.jpg'],
        },
    ],
    lv: [
        {
            key: 'exhibitions',
            title: 'Izstādes',
            description:
                'Mēs regulāri piedalāmies profesionālās izstādēs, prezentējot jaunumus un labākos produktus.',
            images: ['/activity/exhibitions1.jpg', '/activity/exhibitions2.jpg'],
        },
        {
            key: 'seminars',
            title: 'Semināri',
            description:
                'Rīkojam apmācību seminārus meistariem un klientiem ar vadošajiem ekspertiem.',
            images: ['/activity/seminars1.jpg', '/activity/seminars2.jpg'],
        },
        {
            key: 'sponsorship',
            title: 'Sponsorship',
            description: 'Atbalstām profesionālus pasākumus un konkursus skaistumkopšanas nozarē.',
            images: ['/activity/sponsorship1.jpg', '/activity/sponsorship2.jpg'],
        },
    ],
};

interface ActivitySectionProps {
    language?: Language;
}

export default function ActivitySection({ language }: ActivitySectionProps) {
    // SSR/CSR: если язык не передан — fallback на ru
    const lang: Language =
        language ||
        (typeof window !== 'undefined' && (window.localStorage.getItem('lang') as Language)) ||
        'ru';
    const t = translations[lang];
    const acts = activities[lang] || activities['ru'];

    return (
        <section className="activity-section container mx-auto py-12 px-4">
            <h2 className="activity-section__title section__title text-3xl font-bold mb-8 text-center">
                {t['activitySection.title'] || 'Наша деятельность'}
            </h2>
            <div className="activity-section__list grid grid-cols-1 md:grid-cols-3 gap-8">
                {acts.map((activity) => (
                    <Card
                        key={activity.key}
                        className="activity-section__card flex flex-col items-center p-6 shadow-md rounded-2xl bg-card text-card-foreground"
                    >
                        <h3 className="activity-section__subtitle text-xl font-semibold mb-2 text-primary text-center">
                            {activity.title}
                        </h3>
                        <p className="activity-section__desc text-muted-foreground mb-4 text-center">
                            {activity.description}
                        </p>
                        <div className="activity-section__images flex gap-3 w-full overflow-x-auto pb-2 justify-center">
                            {activity.images.map((src) => (
                                <img
                                    key={src}
                                    src={src}
                                    alt={activity.title + ' photo'}
                                    className="activity-section__img rounded-lg border border-border object-cover w-40 h-28"
                                    loading="lazy"
                                />
                            ))}
                        </div>
                    </Card>
                ))}
            </div>
            {/* Контактный блок */}
            <div className="activity-section__contact mt-12 p-6 bg-accent text-accent-foreground rounded-lg text-center col-span-full shadow-sm">
                <h3 className="activity-section__subtitle text-xl font-semibold mb-2">
                    {t['activitySection.contactTitle'] || 'Связаться с нами'}
                </h3>
                <p className="activity-section__desc text-muted-foreground mb-4">
                    {t['activitySection.contactDesc'] ||
                        'По вопросам сотрудничества, участия в мероприятиях или другим предложениям — свяжитесь с нашей командой.'}
                </p>
                <Button asChild size="lg" className="activity-section__btn">
                    <a href="/contact">{t['activitySection.contactBtn'] || 'Связаться'}</a>
                </Button>
            </div>
        </section>
    );
}
