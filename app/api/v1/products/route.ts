import { NextRequest } from 'next/server'
import { logApiError } from '@/lib/observability'
import { authenticateRequest, successResponse, errorResponse, parsePagination, parseFilters } from '@/lib/api-helpers'
import { getDbProductsPaginated } from '@/lib/product-overrides-store'

/**
 * GET /api/v1/products
 * Returns paginated catalog with public pricing
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 * - category: string (optional)
 * - search: string (optional)
 * - minPrice: number (optional)
 * - maxPrice: number (optional)
 * 
 * Headers:
 * - x-api-key: string (optional, for API access)
 */
export async function GET(req: NextRequest): Promise<Response> {
  try {
    // Authenticate
    const auth = await authenticateRequest(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
    }

    // Parse pagination and filters
    const { page, limit, offset } = parsePagination(req)
    const filters = parseFilters(req)

    const { products: paginatedProducts, total } = await getDbProductsPaginated({
      category: filters.category,
      search: filters.search,
      minPrice: filters.minPrice || undefined,
      maxPrice: filters.maxPrice || undefined,
      skip: offset,
      take: limit,
    })

    // Format response with public pricing
    const formattedProducts = paginatedProducts.map(product => ({
      id: product.id,
      title: product.title,
      brand: product.brand,
      sku: product.sku,
      category: product.category,
      image: product.image,
      price: product.price,
      oldPrice: product.oldPrice,
      // No valid ERP B2B price: price fields are absent and the product cannot be ordered.
      ...(product.priceUnavailable ? { priceUnavailable: true } : {}),
      rating: product.rating,
      stock: product.stock,
      technicalSpecs: Object.fromEntries(
        Object.entries(product.technicalSpecs ?? {}).filter(([key]) => key !== '__variantGroupsJson')
      ),
      certificates: product.certificates,
      bulkPricingTiers: product.bulkPricingTiers,
      compatibleEquipment: product.compatibleEquipment
    }))

    return successResponse({
      products: formattedProducts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      meta: {
        audience: 'public',
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    logApiError("API Error:", error)
    return errorResponse('Internal server error', 500)
  }
}



