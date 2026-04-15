import { create } from 'zustand'

export interface SearchFilters {
  query: string
  category?: string
  minPrice: number
  maxPrice: number
  sortBy: 'name' | 'price-asc' | 'price-desc' | 'newest'
}

type SearchStore = {
  filters: SearchFilters
  setQuery: (query: string) => void
  setCategory: (category: string | undefined) => void
  setPriceRange: (min: number, max: number) => void
  setSortBy: (sort: 'name' | 'price-asc' | 'price-desc' | 'newest') => void
  resetFilters: () => void
}

const defaultFilters: SearchFilters = {
  query: '',
  category: undefined,
  minPrice: 0,
  maxPrice: 10000,
  sortBy: 'name'
}

export const useSearch = create<SearchStore>((set) => ({
  filters: defaultFilters,
  setQuery: (query: string) =>
    set((state) => ({
      filters: { ...state.filters, query }
    })),
  setCategory: (category: string | undefined) =>
    set((state) => ({
      filters: { ...state.filters, category }
    })),
  setPriceRange: (min: number, max: number) =>
    set((state) => ({
      filters: { ...state.filters, minPrice: min, maxPrice: max }
    })),
  setSortBy: (sort: 'name' | 'price-asc' | 'price-desc' | 'newest') =>
    set((state) => ({
      filters: { ...state.filters, sortBy: sort }
    })),
  resetFilters: () =>
    set(() => ({
      filters: defaultFilters
    }))
}))
