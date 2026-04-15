import { NextRequest } from 'next/server'
import { authenticateRequest, successResponse, errorResponse, parsePagination, parseFilters } from '@/lib/api-helpers'
import { getCatalogItems, getCatalogCategories } from '@/lib/catalog-service'

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
export async function GET(req: NextRequest) {
  try {
    // Authenticate
    const auth = await authenticateRequest(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
    }

    // Parse pagination and filters
    const { page, limit, offset } = parsePagination(req)
    const filters = parseFilters(req)

    // Get all products
    let products = getCatalogItems(filters.category)

    // Apply search filter if provided
    if (filters.search) {
      const q = filters.search.toLowerCase()
      products = products.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      )
    }

    // Apply price range filter
    if (filters.minPrice) {
      products = products.filter(p => p.price >= filters.minPrice)
    }
    if (filters.maxPrice) {
      products = products.filter(p => p.price <= filters.maxPrice)
    }

    // Pagination
    const total = products.length
    const paginatedProducts = products.slice(offset, offset + limit)

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
      rating: product.rating,
      stock: product.stock,
      technicalSpecs: product.technicalSpecs,
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
    console.error('API Error:', error)
    return errorResponse('Internal server error', 500)
  }
}

/**
 * GET /api/v1/products/categories
 * Returns list of all product categories
 */
export async function getCategories(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
    }

    const categories = getCatalogCategories()

    return successResponse({
      categories,
      count: categories.length
    })
  } catch (error) {
    console.error('API Error:', error)
    return errorResponse('Internal server error', 500)
  }
}
