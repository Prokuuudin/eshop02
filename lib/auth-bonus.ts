import {
    getCurrentUser,
    readUsers,
    writeCurrentUser,
    writeUsers,
    notifyAuthChanged,
} from './auth-storage';

export const adjustUserBonusPoints = (
    userId: string,
    delta: number
): { success: boolean; newBalance?: number; error?: string } => {
    const users = readUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return { success: false, error: 'Пользователь не найден' };

    const newBalance = Math.max(0, (users[idx].bonusPoints ?? 0) + delta);
    users[idx] = { ...users[idx], bonusPoints: newBalance };
    writeUsers(users);

    const current = getCurrentUser();
    if (current?.id === userId) {
        writeCurrentUser({ ...current, bonusPoints: newBalance });
        notifyAuthChanged();
    }

    // Sync to DB — fire-and-forget
    if (typeof window !== 'undefined') {
        fetch('/api/user/bonus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delta, userId }),
        }).catch(() => {});
    }

    return { success: true, newBalance };
};

export const syncBonusBalanceFromServer = async (): Promise<void> => {
    try {
        const res = await fetch('/api/user/bonus');
        if (!res.ok) return;
        const { bonusPoints } = (await res.json()) as { bonusPoints?: number };
        const current = getCurrentUser();
        if (!current || typeof bonusPoints !== 'number') return;

        const users = readUsers();
        const idx = users.findIndex((u) => u.id === current.id);
        if (idx !== -1) {
            users[idx] = { ...users[idx], bonusPoints };
            writeUsers(users);
        }
        writeCurrentUser({ ...current, bonusPoints });
        notifyAuthChanged();
    } catch {
        /* ignore — баланс подтянется на странице аккаунта */
    }
};
