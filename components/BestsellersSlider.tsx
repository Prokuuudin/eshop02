
import { Swiper, SwiperSlide } from "swiper/react"
import { Navigation, Pagination } from "swiper/modules"
import { useRef, useEffect } from "react"
import type { Swiper as SwiperType } from 'swiper';
import "swiper/css"
import "swiper/css/navigation"
import "swiper/css/pagination"
import { PRODUCTS } from "../data/products"
import ProductCard from "./ProductCard"
export default function BestsellersSlider({ arrowsContainerId }: { arrowsContainerId?: string }) {
  const bestsellers = PRODUCTS.filter(p => p.badges?.includes("bestseller"))
  const swiperRef = useRef<SwiperType | null>(null)
  // Render arrows into the container next to the title if id is provided
  useEffect(() => {
    if (!arrowsContainerId || typeof window === "undefined") return;
    const arrowsContainer = document.getElementById(arrowsContainerId);
    if (!arrowsContainer) return;
    // Remove old arrows if any
    while (arrowsContainer.firstChild) arrowsContainer.removeChild(arrowsContainer.firstChild);
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.innerHTML = "&#8592;";
    prevBtn.className = "px-3 py-2 min-h-[44px] min-w-[44px] rounded bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-100";
    prevBtn.onclick = () => swiperRef.current?.slidePrev();
    prevBtn.setAttribute("aria-label", "Previous slide");
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.innerHTML = "&#8594;";
    nextBtn.className = "px-3 py-2 min-h-[44px] min-w-[44px] rounded bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-100 ml-2";
    nextBtn.onclick = () => swiperRef.current?.slideNext();
    nextBtn.setAttribute("aria-label", "Next slide");
    arrowsContainer.appendChild(prevBtn);
    arrowsContainer.appendChild(nextBtn);
    // Cleanup on unmount
    return () => {
      while (arrowsContainer.firstChild) arrowsContainer.removeChild(arrowsContainer.firstChild);
    };
  }, [arrowsContainerId]);
  return (
    <div className="w-full flex justify-center mb-8">
      <div className="w-full">
        <Swiper
          className="bestsellers-swiper"
          modules={[Navigation, Pagination]}
          onSwiper={swiper => (swiperRef.current = swiper)}
          pagination={{ clickable: true }}
          spaceBetween={24}
          slidesPerView={4}
          breakpoints={{
            0: {
              slidesPerView: 1,
              spaceBetween: 12,
            },
            640: {
              slidesPerView: 2,
              spaceBetween: 16,
            },
            1024: {
              slidesPerView: 3,
              spaceBetween: 20,
            },
            1280: {
              slidesPerView: 4,
              spaceBetween: 24,
            },
          }}
          loop={true}
        >
          {bestsellers.map(product => (
            <SwiperSlide key={product.id}>
              <div className="w-full flex flex-col h-full">
                <ProductCard product={product} />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </div>
  )
}
