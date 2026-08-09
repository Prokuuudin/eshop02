'use client';
import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Keyboard } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import { deriveHiResSrc } from '@/lib/image-hires';

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
            className="max-h-full max-w-full object-contain select-none"
            onError={() => setFailed(true)}
        />
    );
};

export default function ProductLightboxSwiper({
    images,
    hiResImages,
    title,
    initialIndex,
    onIndexChange,
}: ProductLightboxSwiperProps): React.ReactElement {
    const canLoop = images.length > 1;
    return (
        <Swiper
            className="product-lightbox-swiper h-full w-full"
            modules={[Navigation, Pagination, Keyboard]}
            navigation={canLoop}
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
    );
}
