import type { ReviewRecord, ReviewStatus } from './reviews-model';

type ReviewPatch =
    | { id: string; status: ReviewStatus }
    | { ids: string[]; status: ReviewStatus }
    | { id: string; reply: string | null };

type ReviewDelete = { id: string } | { ids: string[] };

async function mutateReviews(method: 'PATCH' | 'DELETE', body: ReviewPatch | ReviewDelete): Promise<void> {
    const response = await fetch('/api/admin/reviews', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`reviews-${method.toLowerCase()}-failed`);
}

export async function loadAdminReviews(filters: {
    status: 'all' | ReviewStatus;
    search: string;
}): Promise<ReviewRecord[]> {
    const params = new URLSearchParams();
    if (filters.status !== 'all') params.set('status', filters.status);
    if (filters.search.trim()) params.set('search', filters.search.trim());

    const response = await fetch(`/api/admin/reviews?${params.toString()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('reviews-load-failed');
    const payload = await response.json() as { data?: { reviews?: ReviewRecord[] } };
    return payload.data?.reviews ?? [];
}

export function updateAdminReviews(patch: ReviewPatch): Promise<void> {
    return mutateReviews('PATCH', patch);
}

export function deleteAdminReviews(target: ReviewDelete): Promise<void> {
    return mutateReviews('DELETE', target);
}
