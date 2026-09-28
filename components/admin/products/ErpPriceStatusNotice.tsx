'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider';
import { useAdminLocale } from '@/lib/use-admin-locale';

interface ErpPriceStatusNoticeProps {
    productId: string;
    revision: number;
    price: number;
    erpPriceMissing: boolean;
    manualPriceApproved: boolean;
    manualApprovedPrice?: number;
}

/**
 * Shown only for ERP products whose ERP record has no B2B price (price2 = 0). Such a
 * product is not for sale until the ERP supplies a price or an admin explicitly approves
 * the local Product.price — editing the price alone never approves it.
 */
export default function ErpPriceStatusNotice({
    productId,
    revision,
    price,
    erpPriceMissing,
    manualPriceApproved: approvalFlag,
    manualApprovedPrice,
}: ErpPriceStatusNoticeProps): React.ReactElement | null {
    const { l } = useAdminLocale();
    const confirmAction = useAdminConfirm();
    const router = useRouter();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');

    if (!erpPriceMissing) return null;

    // An approval covers exactly one price; after any price change it no longer applies.
    const manualPriceApproved = approvalFlag && manualApprovedPrice !== undefined
        && Math.round(manualApprovedPrice * 100) === Math.round(price * 100);

    const formattedPrice = `${price.toFixed(2)} €`;

    const submit = async (approved: boolean): Promise<void> => {
        const { confirmed } = await confirmAction(approved ? {
            title: l('Разрешить ручную цену?', 'Allow manual price?', 'Atļaut manuālo cenu?'),
            description: l(
                `В ERP нет B2B-цены (price2 = 0). Товар будет продаваться по локальной цене Hairshop-Pro ${formattedPrice}, пока ERP не передаст свою цену. Любое изменение цены отменит это разрешение.`,
                `The ERP has no B2B price (price2 = 0). The product will be sold at the local Hairshop-Pro price ${formattedPrice} until the ERP supplies its own price. Any price change revokes this approval.`,
                `ERP nav B2B cenas (price2 = 0). Prece tiks pārdota par vietējo Hairshop-Pro cenu ${formattedPrice}, līdz ERP nodos savu cenu. Jebkura cenas maiņa atsauc šo atļauju.`,
            ),
            confirmLabel: l('Разрешить', 'Allow', 'Atļaut'),
        } : {
            title: l('Отозвать ручную цену?', 'Revoke manual price?', 'Atsaukt manuālo cenu?'),
            description: l(
                'Товар снова станет недоступен для покупки, пока ERP не передаст B2B-цену.',
                'The product becomes unavailable for purchase until the ERP supplies a B2B price.',
                'Prece atkal nebūs pieejama pirkšanai, līdz ERP nodos B2B cenu.',
            ),
            destructive: true,
            confirmLabel: l('Отозвать', 'Revoke', 'Atsaukt'),
        });
        if (!confirmed) return;
        setPending(true);
        setError('');
        try {
            const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/manual-price-approval`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(approved ? { approved, revision, expectedPrice: price } : { approved, revision }),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({})) as { error?: string };
                throw new Error(res.status === 409
                    ? l('Товар или его цена уже изменены. Обновите страницу и проверьте цену.', 'The product or its price has changed. Reload the page and check the price.', 'Prece vai tās cena jau ir mainīta. Atjauniniet lapu un pārbaudiet cenu.')
                    : json.error ?? l('Не удалось сохранить', 'Failed to save', 'Neizdevās saglabāt'));
            }
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setPending(false);
        }
    };

    return (
        <div
            className={`erp-price-status mb-4 rounded-lg border p-4 text-sm ${manualPriceApproved
                ? 'erp-price-status--approved border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'
                : 'erp-price-status--missing border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'}`}
            role="status"
        >
            <div className="erp-price-status__header flex items-start gap-2">
                {manualPriceApproved
                    ? <CheckCircle2 className="erp-price-status__icon mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    : <AlertTriangle className="erp-price-status__icon mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                <div className="erp-price-status__body space-y-1">
                    <p className="erp-price-status__title font-semibold">
                        {l('Нет B2B-цены в ERP', 'No B2B price in ERP', 'ERP nav B2B cenas')}
                    </p>
                    <p className="erp-price-status__text">
                        {manualPriceApproved
                            ? l(
                                `Разрешена ручная цена: товар продаётся по локальной цене ${formattedPrice}. ERP price2 = 0.`,
                                `Manual price approved: the product is sold at the local price ${formattedPrice}. ERP price2 = 0.`,
                                `Manuālā cena atļauta: prece tiek pārdota par vietējo cenu ${formattedPrice}. ERP price2 = 0.`,
                            )
                            : l(
                                `Товар не продаётся: ERP price2 = 0. Локальная цена ${formattedPrice} клиентам не показывается. Изменение цены само по себе не делает товар продаваемым.`,
                                `Not for sale: ERP price2 = 0. The local price ${formattedPrice} is hidden from customers. Changing the price alone does not make the product sellable.`,
                                `Nav pārdošanā: ERP price2 = 0. Vietējā cena ${formattedPrice} klientiem netiek rādīta. Cenas maiņa pati par sevi preci nepadara pārdodamu.`,
                            )}
                    </p>
                    {error && <p className="erp-price-status__error text-destructive">{error}</p>}
                </div>
            </div>
            <div className="erp-price-status__actions mt-3 flex flex-wrap gap-2">
                {manualPriceApproved ? (
                    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void submit(false)}>
                        {l('Отозвать ручную цену', 'Revoke manual price', 'Atsaukt manuālo cenu')}
                    </Button>
                ) : (
                    <Button type="button" size="sm" disabled={pending || !(price > 0)} onClick={() => void submit(true)}>
                        {l('Разрешить ручную цену', 'Allow manual price', 'Atļaut manuālo cenu')}
                    </Button>
                )}
            </div>
        </div>
    );
}
