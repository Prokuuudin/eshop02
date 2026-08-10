
import { Swiper, SwiperSlide } from "swiper/react"
import { Navigation, Pagination } from "swiper/modules"
import "swiper/css"
import "swiper/css/navigation"
import "swiper/css/pagination"
import type { Product } from "../data/products"
import ProductCard from "./ProductCard"
import { ChevronLeft, ChevronRight } from "lucide-react"
export default function BestsellersSlider({ products }: { products: Product[] }): React.ReactElement {
  const bestsellers = products
  return (
    <div className="w-full flex justify-center mb-8">
      <div className="bestsellers-slider relative w-full">
        <button
          type="button"
          className="bestsellers-button-prev"
          aria-label="Previous slide"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          className="bestsellers-button-next"
          aria-label="Next slide"
        >
          <ChevronRight aria-hidden="true" />
        </button>
        <Swiper
          className="bestsellers-swiper"
          modules={[Navigation, Pagination]}
          navigation={{
            prevEl: '.bestsellers-button-prev',
            nextEl: '.bestsellers-button-next',
          }}
          pagination={{ clickable: true }}
          spaceBetween={16}
          slidesPerView={6}
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
              slidesPerView: 4,
              spaceBetween: 16,
            },
            1200: {
              slidesPerView: 6,
              spaceBetween: 16,
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
