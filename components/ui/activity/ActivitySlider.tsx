import React from 'react';
import { Card } from '../card';

interface ActivitySliderProps {
    images: string[];
    activityKey: string;
}

export default function ActivitySlider({ images, activityKey }: ActivitySliderProps) {
    // Простой слайдер на flex, для реального проекта можно подключить библиотеку типа keen-slider или swiper
    return (
        <div
            className={`activity-slider activity-slider--${activityKey} flex gap-4 overflow-x-auto py-2`}
        >
            {images.map((src, idx) => (
                <Card
                    key={src}
                    className="activity-slider__card min-w-[260px] max-w-xs flex-shrink-0"
                >
                    <img
                        src={src}
                        alt="activity"
                        className="activity-slider__img w-full h-40 object-cover rounded"
                    />
                </Card>
            ))}
        </div>
    );
}
