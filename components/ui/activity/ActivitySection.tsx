import React from 'react';
import ActivitySlider from './ActivitySlider';

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

export default function ActivitySection() {
    return (
        <section className="activity-section section">
            <h2 className="activity-section__title section__title">Наша деятельность</h2>
            <div className="activity-section__tabs">
                {activities.map((activity) => (
                    <div className="activity-section__tab" key={activity.key}>
                        <h3 className="activity-section__subtitle section__subtitle">
                            {activity.title}
                        </h3>
                        <p className="activity-section__desc section__desc">
                            {activity.description}
                        </p>
                        <ActivitySlider images={activity.images} activityKey={activity.key} />
                    </div>
                ))}
            </div>
        </section>
    );
}
