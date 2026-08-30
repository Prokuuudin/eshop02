import type { CampaignState, EligibleUser, Holder, SortDir } from './invitation-models';

type PageQuery = {
    take: number;
    skip: number;
    search?: string;
    sort?: 'name' | 'email' | 'cardNumber';
    dir?: SortDir;
};

export type InvitationResult = {
    status: string;
    inviteUrl?: string;
};

export type InvitationsResponse = {
    holders?: Holder[];
    total?: number;
    results?: InvitationResult[];
    error?: string;
};

export type CampaignResponse = {
    state?: CampaignState;
};

export type CampaignPageResponse = {
    state: CampaignState;
    totalEligible?: number;
    total?: number;
    users?: EligibleUser[];
};

function buildPageQuery(query: PageQuery): URLSearchParams {
    const params = new URLSearchParams({ take: String(query.take), skip: String(query.skip) });
    if (query.search) params.set('search', query.search);
    if (query.sort) {
        params.set('sort', query.sort);
        params.set('dir', query.dir ?? 'asc');
    }
    return params;
}

async function parseResponse<T>(response: Response): Promise<{ ok: boolean; data: T }> {
    return { ok: response.ok, data: await response.json() as T };
}

export async function fetchInvitationHolders(
    query: PageQuery,
    signal: AbortSignal
): Promise<{ ok: boolean; data: InvitationsResponse }> {
    return parseResponse(await fetch(`/api/admin/invitations?${buildPageQuery(query)}`, { signal }));
}

export async function fetchCardCampaign(
    query: Omit<PageQuery, 'sort'> & { sort?: 'name' | 'email' },
    signal: AbortSignal
): Promise<{ ok: boolean; data: CampaignPageResponse }> {
    return parseResponse(await fetch(`/api/admin/card-rules-campaign?${buildPageQuery(query)}`, { signal }));
}

export async function sendInvitationBatch(
    userIds: string[]
): Promise<{ ok: boolean; data: InvitationsResponse }> {
    return parseResponse(await fetch('/api/admin/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
    }));
}

export async function assignInvitationCard(
    email: string,
    cardNumber: string
): Promise<{ ok: boolean; data: InvitationsResponse }> {
    return parseResponse(await fetch('/api/admin/invitations/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, cardNumber }),
    }));
}

export async function updateCardCampaign(
    reset = false
): Promise<{ ok: boolean; data: CampaignResponse }> {
    return parseResponse(await fetch('/api/admin/card-rules-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reset ? { reset: true } : {}),
    }));
}
