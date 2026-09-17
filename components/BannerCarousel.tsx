'use client';
import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import SaleBanner, { type PromoBanner } from './SaleBanner';

export default function BannerCarousel({ banners }: { banners: PromoBanner[] }): React.ReactElement {
    return (
        <div className="banner-carousel">
            <Swiper
                className="banner-carousel__swiper"
                modules={[Navigation, Pagination, Autoplay]}
                navigation
                pagination={{ clickable: true }}
                spaceBetween={16}
                slidesPerView={1}
                loop={banners.length > 1}
                autoplay={{ delay: 6000, disableOnInteraction: false }}
            >
                {banners.map((item) => (
                    <SwiperSlide key={item.id}>
                        <SaleBanner banner={item} />
                    </SwiperSlide>
                ))}
            </Swiper>
        </div>
    );
}
