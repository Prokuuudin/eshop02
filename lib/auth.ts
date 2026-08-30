import { useCompanyStore } from '@/lib/company-store';
import { logAuditAction } from '@/lib/audit-log-store';
import { normalizeCardNumber } from '@/lib/card-number';
import type { TeamRole, User } from './auth-types';
import {
    CURRENT_KEY,
    normalizeEmail,
    normalizeUser,
    notifyAuthChanged,
    getCurrentUser,
    readUsers,
    writeCurrentUser,
    writeUsers,
} from './auth-storage';

export type { AdminAccessLevel, PlatformRole, TeamRole, User } from './auth-types';
export { getCurrentUser, readUsers, writeCurrentUser, writeUsers } from './auth-storage';
export {
    isAdminUser,
    getAdminAccessLevel,
    canAccessAdminPanel,
    hasFullAdminAccess,
    canViewOrderHistory,
    canPlaceOrders,
} from './auth-access';
export { adjustUserBonusPoints, syncBonusBalanceFromServer } from './auth-bonus';
export { seedTestAccounts } from './auth-demo-accounts';

// Not the real shared welcome password: that constant is server-only (see
// lib/auth-constants.ts) precisely so it never ends up in this client bundle.
// The stored hash built from this placeholder is never read for gating —
// register-card checks the User.mustChangePassword flag + the plaintext
// welcome password against the server-side constant directly, not this hash.
const NO_CARD_REQUEST_PLACEHOLDER_PASSWORD = 'no-card-request-pending-review';

export const hasAdminUsers = (): boolean => {
    return readUsers().some((user) => user.platformRole === 'admin');
};

export const registerAdminUser = async (
    email: string,
    password: string,
    name?: string
): Promise<{ success: boolean; error?: string; adminAlreadyExists?: boolean }> => {
    try {
        const res = await fetch('/api/auth/admin-setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalizeEmail(email), password, name }),
        });
        if (!res.ok) {
            return res.status === 409
                ? { success: false, error: 'Администратор уже создан', adminAlreadyExists: true }
                : { success: false, error: 'Не удалось создать администратора. Попробуйте позже.' };
        }
        const payload = (await res.json()) as { user?: Partial<User> & { id: string; email: string } };
        if (!payload.user) return { success: false, error: 'Не удалось загрузить аккаунт' };
        applyLoggedInUser(payload.user);
        return { success: true };
    } catch {
        return { success: false, error: 'Сервер недоступен. Попробуйте позже.' };
    }
};

// Клиентские submit/approve/reject-функции заявок удалены: заявки подаются
// через POST /api/access-requests, решения — через PATCH
// /api/admin/access-requests/[id] (создаёт держателя карты в Neon).
// Одна карта = один аккаунт; сценария «сотрудник в команду по карте» нет.

export const logout = (): void => {
    void fetch('/api/auth/logout', { method: 'POST' }).catch(() => {
        // Best-effort: local state clears regardless, same as before this call existed.
    });
    localStorage.removeItem(CURRENT_KEY);
    notifyAuthChanged();
};

export const listCompanyUsers = (companyId: string): User[] => {
    return readUsers()
        .filter((user) => user.companyId === companyId)
        .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
};

export const updateUserTeamRole = (
    userId: string,
    nextRole: TeamRole,
    actor?: Pick<User, 'id' | 'email' | 'platformRole'> | null
): { success: boolean; error?: string; user?: User } => {
    if (actor && actor.platformRole !== 'admin') {
        return { success: false, error: 'Изменение ролей доступно только администратору' };
    }

    const users = readUsers();
    const userIndex = users.findIndex((item) => item.id === userId);
    if (userIndex === -1) {
        return { success: false, error: 'Пользователь не найден' };
    }

    const targetUser = users[userIndex];
    if (!targetUser.companyId) {
        return { success: false, error: 'Роль можно менять только у B2B аккаунтов' };
    }

    if (targetUser.platformRole === 'admin') {
        return { success: false, error: 'Роль платформенного администратора изменить нельзя' };
    }

    const company = useCompanyStore.getState().getCompany(targetUser.companyId);
    if (!company) {
        return { success: false, error: 'Компания пользователя не найдена' };
    }

    const updatedUser: User = {
        ...targetUser,
        teamRole: nextRole,
        approvalRequired: company.approvalWorkflowEnabled && nextRole !== 'admin',
    };

    users[userIndex] = updatedUser;
    writeUsers(users);

    useCompanyStore.getState().updateTeamMemberRole(targetUser.companyId, targetUser.id, nextRole);

    const currentUser = getCurrentUser();
    if (currentUser?.id === updatedUser.id) {
        writeCurrentUser(updatedUser);
    }

    logAuditAction(
        targetUser.companyId,
        actor?.id ?? updatedUser.id,
        'team_member_role_updated',
        {
            targetUserId: updatedUser.id,
            targetUserEmail: updatedUser.email,
            nextRole,
        },
        {
            userEmail: actor?.email,
        }
    );

    notifyAuthChanged();
    return { success: true, user: updatedUser };
};

export type RegisterCardErrorCode =
    | 'card_not_found'
    | 'card_already_registered'
    | 'wrong_password'
    | 'wrong_code'
    | 'no_personal_code_on_file'
    | 'too_many_attempts'
    | 'network_error'
    | 'server_error';

/**
 * Registers a B2B customer against a real company card number. Validates the
 * card and creates the account server-side (Prisma + session cookie) via
 * /api/auth/register-card — never locally. A local-only account would look
 * logged in but be invisible to every server-authoritative endpoint (orders,
 * bonus, addresses), so this must round-trip the server like loginUserAuto.
 */
export const registerCardUser = async (data: {
    cardNumber: string;
    password: string;
    name?: string;
    privacyAcknowledged?: boolean;
    marketingConsent?: boolean;
}): Promise<{ success: boolean; errorCode?: RegisterCardErrorCode }> => {
    const normalizedCard = normalizeCardNumber(data.cardNumber);

    let res: Response;
    try {
        res = await fetch('/api/auth/register-card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cardNumber: normalizedCard,
                password: data.password,
                name: data.name,
                privacyAcknowledged: data.privacyAcknowledged === true,
                marketingConsent: data.marketingConsent === true,
            }),
        });
    } catch {
        return { success: false, errorCode: 'network_error' };
    }

    if (res.status === 404) return { success: false, errorCode: 'card_not_found' };
    if (res.status === 409) return { success: false, errorCode: 'card_already_registered' };
    if (res.status === 422) return { success: false, errorCode: 'no_personal_code_on_file' };
    if (res.status === 401) {
        let errorCode: RegisterCardErrorCode = 'wrong_password';
        try {
            const body = (await res.json()) as { error?: string };
            if (body.error === 'wrong_code') errorCode = 'wrong_code';
        } catch {
            // No readable JSON body (e.g. a legacy mocked response) — the shared
            // company-branch wrong-password case is the safe default here.
        }
        return { success: false, errorCode };
    }
    if (res.status === 429) return { success: false, errorCode: 'too_many_attempts' };
    if (!res.ok) return { success: false, errorCode: 'server_error' };

    const payload = (await res.json()) as { user?: Partial<User> & { id: string; email: string } };
    if (!payload.user) return { success: false, errorCode: 'server_error' };

    const verifiedUser = normalizeUser({ ...payload.user, password: '', isNewUser: true });
    const users = readUsers().filter((u) => u.id !== verifiedUser.id);
    writeUsers([...users, verifiedUser]);
    writeCurrentUser(verifiedUser);

    if (verifiedUser.companyId) {
        useCompanyStore.getState().setCurrentCompany(verifiedUser.companyId);
    }

    notifyAuthChanged();
    return { success: true };
};

export const clearNewUserFlag = (): void => {
    const user = getCurrentUser();
    if (!user) return;
    const users = readUsers();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx === -1) return;
    users[idx] = { ...users[idx], isNewUser: false };
    writeUsers(users);
    writeCurrentUser(users[idx]);
    notifyAuthChanged();
};

// Forced first-login password change. Writes the new password to the DB (bcrypt) via the
// session — the old version mutated only localStorage, so the real hash never changed and the
// user was locked to the default password on their next login.
export const forceChangePassword = async (
    newPassword: string
): Promise<{ success: boolean; error?: string }> => {
    const user = getCurrentUser();
    if (!user) return { success: false, error: 'Не авторизован' };
    if (newPassword.length < 8) {
        return { success: false, error: 'Пароль должен быть не менее 8 символов' };
    }

    let res: Response;
    try {
        res = await fetch('/api/user/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newPassword }),
        });
    } catch {
        return { success: false, error: 'Сервер недоступен. Попробуйте позже.' };
    }
    if (!res.ok) {
        return { success: false, error: 'Не удалось сменить пароль. Попробуйте позже.' };
    }

    const users = readUsers();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx !== -1) {
        users[idx] = { ...users[idx], password: '', mustChangePassword: false };
        writeUsers(users);
        writeCurrentUser(users[idx]);
    } else {
        writeCurrentUser({ ...user, password: '', mustChangePassword: false });
    }
    notifyAuthChanged();
    return { success: true };
};

export const submitNoCardRequest = async (data: {
    name: string;
    email: string;
    phone?: string;
    certificateData: string;
    certificateName: string;
    message?: string;
    language?: 'ru' | 'en' | 'lv';
    turnstileToken?: string;
    privacyAcknowledged?: boolean;
    marketingConsent?: boolean;
}): Promise<{ success: boolean; error?: string }> => {
    const normalizedEmail = normalizeEmail(data.email);

    if (!normalizedEmail) return { success: false, error: 'Укажите email' };
    // Remove sensitive drafts left by the legacy persisted request store.
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('access-request-store');
    }

    let response: Response;
    try {
        response = await fetch('/api/access-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: normalizedEmail,
                password: NO_CARD_REQUEST_PLACEHOLDER_PASSWORD,
                name: data.name,
                phone: data.phone,
                companyId: '',
                companyName: '',
                cardNumber: '',
                requestType: 'no-card',
                certificateData: data.certificateData,
                certificateName: data.certificateName,
                message: data.message,
                language: data.language,
                turnstileToken: data.turnstileToken,
                privacyAcknowledged: data.privacyAcknowledged === true,
                marketingConsent: data.marketingConsent === true,
            }),
        });
    } catch {
        return { success: false, error: 'Сервер недоступен. Попробуйте позже.' };
    }

    if (response.ok) return { success: true };

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    const errors: Record<string, string> = {
        pending_exists: 'Заявка с таким email уже ожидает рассмотрения.',
        rate_limited: 'Слишком много попыток. Попробуйте позже.',
        captcha_required: 'Подтвердите, что вы не робот.',
        captcha_failed: 'Проверка CAPTCHA не пройдена. Попробуйте ещё раз.',
        captcha_not_configured: 'Отправка заявок временно недоступна.',
        certificate_too_large: 'Файл слишком большой.',
        invalid_certificate: 'Недопустимый формат сертификата.',
        privacy_acknowledgement_required:
            'Подтвердите, что вы ознакомились с Политикой конфиденциальности.',
    };
    return {
        success: false,
        error: errors[payload.error ?? ''] ?? 'Не удалось сохранить заявку. Попробуйте позже.',
    };
};

function applyLoggedInUser(rawUser: Partial<User> & { id: string; email: string }): void {
    const users = readUsers();
    const verifiedUser = normalizeUser({ ...rawUser, password: '' });
    const nextUsers = users.filter(
        (u) => u.id !== verifiedUser.id && u.email !== verifiedUser.email
    );
    writeUsers([...nextUsers, verifiedUser]);

    if (verifiedUser.companyId) {
        useCompanyStore.getState().setCurrentCompany(verifiedUser.companyId);
    }
    writeCurrentUser(verifiedUser);
    notifyAuthChanged();
}

/** Mirrors the user belonging to the existing server session into client state. */
export async function syncCurrentSessionUser(): Promise<boolean> {
    try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!res.ok) return false;
        const payload = (await res.json()) as { user?: Partial<User> & { id: string; email: string } };
        if (!payload.user) return false;
        applyLoggedInUser(payload.user);
        return true;
    } catch {
        return false;
    }
}

/**
 * Authenticates against the server (bcrypt-verified, rate-limited) — the client
 * never decides whether a password is correct. `identifier` may be an email or
 * a client card number; the server looks up User.email or User.cardNumber
 * directly without trusting any locally-cached directory. On success, the local mirror is refreshed for UI
 * purposes only, with the password field blanked — it is never the source of
 * truth for auth again once a login round-trip has verified the account.
 *
 * MFA-enabled admins don't get a session here: the server responds with
 * `mfaRequired` + a short-lived `challengeToken` instead, and the caller must
 * follow up with `verifyMfaAndLogin`.
 */
export const loginUserAuto = async (
    identifier: string,
    password: string
): Promise<{ success: boolean; error?: string; mfaRequired?: boolean; challengeToken?: string }> => {
    const trimmed = identifier.trim();

    let res: Response;
    try {
        res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier: trimmed,
                password,
            }),
        });
    } catch {
        return { success: false, error: 'Сервер недоступен. Попробуйте позже.' };
    }

    if (res.status === 429) {
        return { success: false, error: 'Слишком много попыток входа. Попробуйте позже.' };
    }
    if (!res.ok) {
        return {
            success: false,
            error: 'Неверные данные для входа',
        };
    }

    const payload = (await res.json().catch(() => ({}))) as {
        user?: Partial<User> & { id: string; email: string };
        mfaRequired?: boolean;
        challengeToken?: string;
    };

    if (payload.mfaRequired && payload.challengeToken) {
        return { success: false, mfaRequired: true, challengeToken: payload.challengeToken };
    }
    if (!payload.user) {
        return { success: false, error: 'Не удалось загрузить аккаунт' };
    }

    applyLoggedInUser(payload.user);
    return { success: true };
};
/** Second step of an MFA-gated login — completes what loginUserAuto started. */
export const verifyMfaAndLogin = async (
    challengeToken: string,
    code: string
): Promise<{ success: boolean; error?: string }> => {
    let res: Response;
    try {
        res = await fetch('/api/auth/mfa/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ challengeToken, code }),
        });
    } catch {
        return { success: false, error: 'Сервер недоступен. Попробуйте позже.' };
    }

    if (res.status === 429) {
        return { success: false, error: 'Слишком много попыток. Попробуйте позже.' };
    }
    if (!res.ok) {
        return { success: false, error: 'Неверный код' };
    }

    const payload = (await res.json().catch(() => ({}))) as { user?: Partial<User> & { id: string; email: string } };
    if (!payload.user) {
        return { success: false, error: 'Не удалось загрузить аккаунт' };
    }

    applyLoggedInUser(payload.user);
    return { success: true };
};
