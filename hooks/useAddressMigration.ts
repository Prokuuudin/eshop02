import { useEffect } from 'react';

export function useAddressMigration(
    user: any,
    userOrders: any[],
    getByEmail: (...args: any[]) => any,
    replaceForEmail: (...args: any[]) => any
) {
    useEffect(() => {
        if (!user?.email) return;
        const SAVED_ADDRESS_MIGRATION_KEY = 'saved-addresses-migration-v1';
        let migratedEmails = new Set();
        try {
            const raw = localStorage.getItem(SAVED_ADDRESS_MIGRATION_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    migratedEmails = new Set(parsed);
                }
            }
        } catch {
            migratedEmails = new Set();
        }
        if (migratedEmails.has(user.email)) return;
        const existing = getByEmail(user.email);
        if (existing.length > 0) {
            migratedEmails.add(user.email);
            try {
                localStorage.setItem(
                    SAVED_ADDRESS_MIGRATION_KEY,
                    JSON.stringify(Array.from(migratedEmails))
                );
            } catch {}
            return;
        }
        const existingSignatureSet = new Set(
            existing.map(
                (item: any) => `${item.firstName}|${item.lastName}|${item.phone}|${item.address}|${item.city}|${item.postalCode ?? ''}`
            )
        );
        const migratedFromOrders = userOrders
            .map((order) => ({
                id: `addr_${order.id}`,
                firstName: order.firstName,
                lastName: order.lastName,
                email: order.email,
                phone: order.phone,
                address: order.address,
                city: order.city,
                postalCode: order.postalCode,
            }))
            .filter((item) => {
                const signature = `${item.firstName}|${item.lastName}|${item.phone}|${item.address}|${item.city}|${item.postalCode ?? ''}`;
                return !existingSignatureSet.has(signature);
            });
        if (migratedFromOrders.length > 0) {
            replaceForEmail(user.email, [...existing, ...migratedFromOrders]);
        }
        migratedEmails.add(user.email);
        try {
            localStorage.setItem(
                SAVED_ADDRESS_MIGRATION_KEY,
                JSON.stringify(Array.from(migratedEmails))
            );
        } catch {}
    }, [user?.email, userOrders, getByEmail, replaceForEmail]);
}
