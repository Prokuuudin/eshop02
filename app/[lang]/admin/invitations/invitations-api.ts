import type { CampaignState, EligibleUser, Holder, HolderContactFilter, HolderInvitationFilter, SortDir } from './invitation-models';

type PageQuery = {
    take: number;
    skip: number;
    search?: string;
    sort?: 'name' | 'email' | 'cardNumber';
    dir?: SortDir;
    contact?: HolderContactFilter;
    invitation?: HolderInvitationFilter;
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

export type PhoneMessageTemplate = {
    id: string;
    body: string;
    variables: string[];
};

function buildPageQuery(query: PageQuery): URLSearchParams {
    const params = new URLSearchParams({ take: String(query.take), skip: String(query.skip) });
    if (query.search) params.set('search', query.search);
    if (query.sort) {
        params.set('sort', query.sort);
        params.set('dir', query.dir ?? 'asc');
    }
    if (query.contact && query.contact !== 'all') params.set('contact', query.contact);
    if (query.invitation && query.invitation !== 'all') params.set('invitation', query.invitation);
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

export async function fetchPhoneMessageTemplate(
    language: 'ru' | 'en' | 'lv',
    signal: AbortSignal
): Promise<PhoneMessageTemplate | null> {
    const response = await fetch('/api/admin/email-templates', { signal });
    if (!response.ok) return null;
    const templates = await response.json() as PhoneMessageTemplate[];
    return templates.find((template) => template.id === `sms-invite-${language}`) ?? null;
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

export async function sendSmsInvitationBatch(
    userIds: string[],
    language: 'ru' | 'en' | 'lv'
): Promise<{ ok: boolean; data: { simulated?: boolean; results?: Array<{ userId: string; status: string }>; error?: string } }> {
    return parseResponse(await fetch('/api/admin/invitations/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds, language }),
    }));
}

export type AssignCardResult = { ok: true; userId: string; created: boolean } | { error: string };

export async function assignInvitationCard(
    email: string,
    cardNumber: string,
    name?: string,
    phone?: string
): Promise<{ ok: boolean; data: AssignCardResult }> {
    return parseResponse(await fetch('/api/admin/invitations/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, cardNumber, name, phone }),
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
