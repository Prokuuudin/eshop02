import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useCart } from '@/lib/cart-store'

/**
 * Какие позиции корзины выбраны для оформления. Общий для страницы корзины и дровера.
 *
 * Модель инвертирована: по умолчанию выбрано всё, храним только снятые вручную lineKey.
 * Так новые позиции выбраны автоматически (их нет в списке снятых), а снятая галка
 * переживает навигацию и перезагрузку, пока позиция остаётся в корзине.
 */
type CartSelectionStore = {
  deselectedLineKeys: string[]
  toggle: (lineKey: string) => void
  selectAll: () => void
  unselectAll: (allLineKeys: string[]) => void
  /** Убирает ключи позиций, которых больше нет в корзине: повторно добавленный товар снова выбран. */
  prune: (currentLineKeys: string[]) => void
}

export const useCartSelection = create<CartSelectionStore>()(
  persist(
    (set, get) => ({
      deselectedLineKeys: [],
      toggle: (lineKey: string) => {
        set((state) => ({
          deselectedLineKeys: state.deselectedLineKeys.includes(lineKey)
            ? state.deselectedLineKeys.filter((key) => key !== lineKey)
            : [...state.deselectedLineKeys, lineKey],
        }))
      },
      selectAll: () => {
        set({ deselectedLineKeys: [] })
      },
      unselectAll: (allLineKeys: string[]) => {
        set({ deselectedLineKeys: allLineKeys })
      },
      prune: (currentLineKeys: string[]) => {
        const current = new Set(currentLineKeys)
        const next = get().deselectedLineKeys.filter((key) => current.has(key))
        if (next.length !== get().deselectedLineKeys.length) {
          set({ deselectedLineKeys: next })
        }
      },
    }),
    { name: 'cart-selection' }
  )
)

export function isLineSelected(deselectedLineKeys: string[], lineKey: string): boolean {
  return !deselectedLineKeys.includes(lineKey)
}

// Оба стора гидрируются синхронно из localStorage при создании, поэтому подписка
// не видит промежуточного пустого состояния корзины.
if (typeof window !== 'undefined') {
  useCart.subscribe((state) => {
    useCartSelection.getState().prune(state.items.map((item) => item.lineKey))
  })
}
