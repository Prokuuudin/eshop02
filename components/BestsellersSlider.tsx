
import { Swiper, SwiperSlide } from "swiper/react"
import { Navigation, Pagination } from "swiper/modules"
import "swiper/css"
import "swiper/css/navigation"
import "swiper/css/pagination"
import type { Product } from "../data/products"
import ProductCard from "./ProductCard"
export default function BestsellersSlider({ products }: { products: Product[] }): React.ReactElement {
  const bestsellers = products
  return (
    <div className="w-full flex justify-center mb-8">
      <div className="w-full">
        <Swiper
          className="bestsellers-swiper"
          modules={[Navigation, Pagination]}
          navigation
          pagination={{ clickable: true }}
          spaceBetween={16}
          slidesPerView={5}
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
              slidesPerView: 5,
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
