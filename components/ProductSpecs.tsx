import React from 'react';
import { useTranslation } from '@/lib/use-translation';

interface ProductSpecsProps {
    volume: string;
    type: string;
    country: string;
    purpose?: string;
    unitOfMeasure?: string;
    packagingSize?: number;
}

export const ProductSpecs: React.FC<ProductSpecsProps> = ({
    volume,
    type,
    country,
    purpose,
    unitOfMeasure,
    packagingSize,
}) => {
    const { t } = useTranslation();

    // Показываем только реально заполненные характеристики; без данных — блока нет.
    const rows = [
        { label: t('product.purpose'), value: purpose ?? '' },
        { label: t('product.spec.volume'), value: volume },
        { label: t('product.spec.type'), value: type },
        { label: t('product.spec.country'), value: country },
        { label: t('product.spec.unit'), value: unitOfMeasure ?? '' },
        {
            label: t('product.spec.packaging'),
            value: packagingSize && packagingSize > 0 ? `${packagingSize} ${t('product.pcs')}` : '',
        },
    ].filter((row) => row.value.trim() !== '');

    if (rows.length === 0) {
        return null;
    }

    return (
        <div className="product-detail__specs mt-4 p-4 bg-muted rounded-lg border border-border">
            <h3 className="font-semibold mb-3 text-foreground">
                {t('product.specs')}
            </h3>
            <table className="w-full text-sm">
                <tbody>
                    {rows.map((row, idx) => (
                        <tr key={row.label} className={idx < rows.length - 1 ? 'border-b border-border' : ''}>
                            <td className="py-2 font-medium text-muted-foreground">{row.label}</td>
                            <td className="py-2">{row.value}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
