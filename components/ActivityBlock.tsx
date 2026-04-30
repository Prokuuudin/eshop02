import * as React from 'react';
import { Card } from './ui/card';

const activities = [
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
        description: 'Поддерживаем профессиональные мероприятия и конкурсы в индустрии красоты.',
        images: ['/activity/sponsorship1.jpg', '/activity/sponsorship2.jpg'],
    },
];

export default function ActivityBlock() {
    return (
        <section className="activity-block container mx-auto py-12 px-4">
            <h2 className="text-3xl font-bold mb-8 text-center">Наша деятельность</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {activities.map((activity) => (
                    <Card
                        key={activity.key}
                        className="flex flex-col items-center p-6 shadow-md rounded-2xl bg-white dark:bg-gray-900"
                    >
                        <h3 className="text-xl font-semibold mb-2 text-indigo-700 dark:text-indigo-400 text-center">
                            {activity.title}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-300 mb-4 text-center">
                            {activity.description}
                        </p>
                        <div className="flex gap-3 w-full overflow-x-auto pb-2 justify-center">
                            {activity.images.map((src, idx) => (
                                <img
                                    key={src}
                                    src={src}
                                    alt={activity.title + ' фото'}
                                    className="rounded-lg border border-gray-200 dark:border-gray-700 object-cover w-40 h-28"
                                    loading="lazy"
                                />
                            ))}
                        </div>
                    </Card>
                ))}
            </div>
        </section>
    );
}
