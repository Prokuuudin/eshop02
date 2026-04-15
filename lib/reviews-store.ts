import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Review {
  id: string
  productId: string
  author: string
  rating: number
  title: string
  text: string
  createdAt: Date
  helpful: number
}

type ReviewsStore = {
  reviews: Review[]
  addReview: (review: Omit<Review, 'id' | 'createdAt'>) => Review
  getProductReviews: (productId: string) => Review[]
  getProductStats: (productId: string) => {
    averageRating: number
    count: number
    distribution: Record<number, number>
  }
  markHelpful: (reviewId: string) => void
}

export const useReviews = create<ReviewsStore>()(
  persist(
    (set, get) => ({
      reviews: [],

      addReview: (review) => {
        const newReview: Review = {
          ...review,
          id: `r_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date()
        }
        set((state) => ({
          reviews: [newReview, ...state.reviews]
        }))
        return newReview
      },

      getProductReviews: (productId: string) => {
        return get()
          .reviews.filter((r) => r.productId === productId)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      },

      getProductStats: (productId: string) => {
        const reviews = get().reviews.filter((r) => r.productId === productId)
        if (!reviews.length)
          return {
            averageRating: 0,
            count: 0,
            distribution: {}
          }

        const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        reviews.forEach((r) => {
          distribution[r.rating]++
        })

        const sum = reviews.reduce((acc, r) => acc + r.rating, 0)
        const avg = Math.round((sum / reviews.length) * 10) / 10

        return {
          averageRating: avg,
          count: reviews.length,
          distribution
        }
      },

      markHelpful: (reviewId: string) => {
        set((state) => ({
          reviews: state.reviews.map((r) => (r.id === reviewId ? { ...r, helpful: r.helpful + 1 } : r))
        }))
      }
    }),
    {
      name: 'reviews-store'
    }
  )
)
