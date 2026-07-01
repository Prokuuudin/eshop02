import React from 'react';
import type { BrandManufacturerInfo } from '@/lib/brands-config';
import { useTranslation } from '@/lib/use-translation';

export const ManufacturerDistributorInfo: React.FC<{
    manufacturer?: BrandManufacturerInfo;
    distributor?: BrandManufacturerInfo;
    language: string;
}> = ({ manufacturer, distributor }) => {
    const { t } = useTranslation();

    const fullName = manufacturer?.name || '—';
    const address = manufacturer?.address || '—';
    const email = manufacturer?.email;

    const distributorName = distributor?.name || fullName;
    const distributorAddress = distributor?.address || address;
    const distributorEmail = distributor?.email || email;

    return (
        <div className="product-detail__manufacturer-distributor mt-2 p-4 bg-blue-50 dark:bg-blue-900 rounded-lg border border-blue-200 dark:border-blue-700 text-sm">
            <div className="mb-2 font-semibold text-blue-900 dark:text-blue-100">
                {t('manufacturer.title')}
            </div>
            <ul className="mb-4 list-disc pl-5">
                <li>{t('manufacturer.fullName')} {fullName}</li>
                <li>{t('manufacturer.address')} {address}</li>
                <li>
                    {t('manufacturer.email')}{' '}
                    {email ? (
                        <a href={`mailto:${email}`} className="text-blue-700 underline">{email}</a>
                    ) : '—'}
                </li>
            </ul>
            <div className="mb-2 font-semibold text-blue-900 dark:text-blue-100">
                {t('distributor.title')}
            </div>
            <ul className="list-disc pl-5">
                <li>{t('distributor.name')} {distributorName}</li>
                <li>{t('distributor.address')} {distributorAddress}</li>
                <li>
                    {t('distributor.email')}{' '}
                    {distributorEmail ? (
                        <a href={`mailto:${distributorEmail}`} className="text-blue-700 underline">{distributorEmail}</a>
                    ) : '—'}
                </li>
            </ul>
        </div>
    );
};
