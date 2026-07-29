import { errorResponse, successResponse } from '@/lib/api-helpers'
import { getReviewsByAuthor } from '@/lib/reviews-data-store'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return errorResponse('Unauthorized', 401)

    // У Review нет userId (схему живой БД не меняем) — матчим по имени автора,
    // которое POST /api/reviews принудительно берёт из сессии.
    const author = user.name?.trim()
    if (!author) return successResponse({ reviews: [] })

    const reviews = await getReviewsByAuthor(author)
    return successResponse({ reviews })
  } catch (error) {
    console.error('Reviews my GET error:', error)
    return errorResponse('Internal server error', 500)
  }
}
