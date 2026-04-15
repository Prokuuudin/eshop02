import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SavedAddress = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  postalCode?: string
}

type SavedAddressesStore = {
  addressesByEmail: Record<string, SavedAddress[]>
  getByEmail: (email: string) => SavedAddress[]
  replaceForEmail: (email: string, addresses: SavedAddress[]) => void
  upsertForEmail: (email: string, address: SavedAddress) => void
  deleteForEmail: (email: string, addressId: string) => void
}

export const useSavedAddresses = create<SavedAddressesStore>()(
  persist(
    (set, get) => ({
      addressesByEmail: {},
      getByEmail: (email: string) => get().addressesByEmail[email] ?? [],
      replaceForEmail: (email: string, addresses: SavedAddress[]) => {
        set((state) => ({
          addressesByEmail: {
            ...state.addressesByEmail,
            [email]: addresses
          }
        }))
      },
      upsertForEmail: (email: string, address: SavedAddress) => {
        set((state) => {
          const existing = state.addressesByEmail[email] ?? []
          const hasAddress = existing.some((item) => item.id === address.id)

          return {
            addressesByEmail: {
              ...state.addressesByEmail,
              [email]: hasAddress
                ? existing.map((item) => (item.id === address.id ? address : item))
                : [address, ...existing]
            }
          }
        })
      },
      deleteForEmail: (email: string, addressId: string) => {
        set((state) => ({
          addressesByEmail: {
            ...state.addressesByEmail,
            [email]: (state.addressesByEmail[email] ?? []).filter((item) => item.id !== addressId)
          }
        }))
      }
    }),
    {
      name: 'saved-addresses-store'
    }
  )
)
