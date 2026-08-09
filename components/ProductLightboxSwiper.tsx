'use client';
import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Keyboard } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper/types';
import 'swiper/css';
import 'swiper/css/pagination';
import { deriveHiResSrc } from '@/lib/image-hires';
import { IconChevron } from '@/components/ui/icon-chevron';

interface ProductLightboxSwiperProps {
    images: string[];
    hiResImages?: string[];
    title: string;
    initialIndex: number;
    onIndexChange: (index: number) => void;
}

// Отдельная картинка слайда: пробуем hi-res, при 404 откатываемся на исходный
// src (оригинал nopCommerce без суффикса _NNN гарантированно не существует).
const LightboxSlideImage: React.FC<{ src: string; hiResSrc?: string; alt: string }> = ({
    src,
    hiResSrc,
    alt,
}) => {
    const [failed, setFailed] = React.useState(false);
    const finalSrc = hiResSrc && !failed ? hiResSrc : src;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            key={src}
            src={finalSrc}
            alt={alt}
            draggable={false}
            className="m-auto max-h-full max-w-full object-contain select-none"
            onError={() => setFailed(true)}
        />
    );
};

// Стрелки в стиле карточек товара (as WishlistButton/bestsellers-swiper) —
// кастомные кнопки вместо дефолтной иконки-шрифта Swiper; управляют
// инстансом напрямую (slidePrev/slideNext) — надёжнее, чем прокидывать
// DOM-рефы в navigation.prevEl/nextEl через onBeforeInit.
const NavButton: React.FC<{
    dir: 'prev' | 'next';
    onClick: () => void;
    label: string;
}> = ({ dir, onClick, label }) => (
    <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`absolute top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-md transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground ${
            dir === 'prev' ? 'left-3' : 'right-3'
        }`}
    >
        <IconChevron className={dir === 'next' ? 'rotate-180' : undefined} width={20} height={20} />
    </button>
);

export default function ProductLightboxSwiper({
    images,
    hiResImages,
    title,
    initialIndex,
    onIndexChange,
}: ProductLightboxSwiperProps): React.ReactElement {
    const canLoop = images.length > 1;
    const swiperRef = React.useRef<SwiperType | null>(null);

    return (
        <div className="relative h-full w-full">
            <Swiper
                className="product-lightbox-swiper h-full w-full"
                modules={[Pagination, Keyboard]}
                onSwiper={(swiper) => {
                    swiperRef.current = swiper;
                }}
                pagination={canLoop ? { clickable: true } : false}
                keyboard={{ enabled: true }}
                initialSlide={initialIndex}
                loop={canLoop}
                onSlideChange={(swiper) => onIndexChange(swiper.realIndex)}
            >
                {images.map((src, idx) => (
                    <SwiperSlide key={src} className="flex items-center justify-center">
                        <LightboxSlideImage
                            src={src}
                            hiResSrc={hiResImages?.[idx] ?? deriveHiResSrc(src)}
                            alt={`${title} ${idx + 1}`}
                        />
                    </SwiperSlide>
                ))}
            </Swiper>
            {canLoop && (
                <>
                    <NavButton
                        dir="prev"
                        label="Предыдущее фото"
                        onClick={() => swiperRef.current?.slidePrev()}
                    />
                    <NavButton
                        dir="next"
                        label="Следующее фото"
                        onClick={() => swiperRef.current?.slideNext()}
                    />
                </>
            )}
        </div>
    );
}
