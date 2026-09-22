'use client';
import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SaleBanner, { type PromoBanner } from './SaleBanner';

export default function BannerCarousel({ banners, scrollMode = 'auto' }: { banners: PromoBanner[]; scrollMode?: 'manual' | 'auto' }): React.ReactElement {
    return (
        <div className="banner-carousel relative aspect-[24/5]">
            <button type="button" className="banner-carousel__button-prev" aria-label="Previous slide">
                <ChevronLeft aria-hidden="true" />
            </button>
            <button type="button" className="banner-carousel__button-next" aria-label="Next slide">
                <ChevronRight aria-hidden="true" />
            </button>
            <Swiper
                className="banner-carousel__swiper !h-full"
                modules={[Navigation, Pagination, Autoplay]}
                navigation={{ prevEl: '.banner-carousel__button-prev', nextEl: '.banner-carousel__button-next' }}
                pagination={{ clickable: true }}
                spaceBetween={16}
                slidesPerView={1}
                loop={banners.length > 1}
                autoplay={scrollMode === 'auto' ? { delay: 6000, disableOnInteraction: false } : false}
            >
                {banners.map((item) => (
                    <SwiperSlide key={item.id} className="!h-full">
                        <SaleBanner banner={item} fixedMediaFrame />
                    </SwiperSlide>
                ))}
            </Swiper>
        </div>
    );
}
