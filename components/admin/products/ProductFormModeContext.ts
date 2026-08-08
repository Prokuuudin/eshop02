'use client'

import { createContext, useContext } from 'react'

type ProductFormModeContextValue = { isEdit: boolean }

export const ProductFormModeContext = createContext<ProductFormModeContextValue>({ isEdit: false })
export const useProductFormMode = (): ProductFormModeContextValue => useContext(ProductFormModeContext)
