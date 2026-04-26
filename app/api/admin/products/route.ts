import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { createProduct, deleteProductAny, getMergedProducts, resetProductOverride, upsertProductOverride } from '@/lib/product-overrides-store'
import type { Product } from '@/data/products'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const products = await getMergedProducts()
    return successResponse({ products })
  } catch (error) {
    console.error('Admin products GET error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { id?: string; changes?: Partial<Omit<Product, 'id'>> }
    const id = body.id?.trim()
    const changes = body.changes

    if (!id) {
      return errorResponse('Product id is required', 400)
    }
    if (!changes || typeof changes !== 'object') {
      return errorResponse('Product changes are required', 400)
    }

    const result = await upsertProductOverride(id, changes)
    if (!result.success) {
      return errorResponse(result.error, 404)
    }

    return successResponse({ products: result.products })
  } catch (error) {
    console.error('Admin products PUT error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { product?: Product }
    const product = body.product

    if (!product || typeof product !== 'object') {
      return errorResponse('Product payload is required', 400)
    }

    const requiredStringFields = [product.id, product.title, product.brand, product.image]
    if (requiredStringFields.some((value) => typeof value !== 'string' || !value.trim())) {
      return errorResponse('Product id, title, brand and image are required', 400)
    }

    if (typeof product.price !== 'number' || !Number.isFinite(product.price)) {
      return errorResponse('Product price must be a finite number', 400)
    }
    if (typeof product.rating !== 'number' || !Number.isFinite(product.rating)) {
      return errorResponse('Product rating must be a finite number', 400)
    }
    if (typeof product.stock !== 'number' || !Number.isFinite(product.stock)) {
      return errorResponse('Product stock must be a finite number', 400)
    }
    if (!product.category || typeof product.category !== 'string') {
      return errorResponse('Product category is required', 400)
    }

    const result = await createProduct(product)
    if (!result.success) {
      return errorResponse(result.error, 400)
    }

    return successResponse({ products: result.products })
  } catch (error) {
    console.error('Admin products POST error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json()) as { id?: string; permanently?: boolean }
    const id = body.id?.trim()
    const permanently = body.permanently === true

    if (!id) {
      return errorResponse('Product id is required', 400)
    }

    const result = permanently ? await deleteProductAny(id) : await resetProductOverride(id)
    if (!result.success) {
      return errorResponse(result.error, 400)
    }

    return successResponse({ products: result.products })
  } catch (error) {
    console.error('Admin products DELETE error:', error)
    return errorResponse('Internal server error', 500)
  }
}
