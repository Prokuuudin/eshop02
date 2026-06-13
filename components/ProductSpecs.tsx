import React from 'react';
import { useTranslation } from '@/lib/use-translation';

interface ProductSpecsProps {
    volume: string;
    type: string;
    country: string;
}

export const ProductSpecs: React.FC<ProductSpecsProps> = ({ volume, type, country }) => {
    const { t } = useTranslation();
    return (
        <div className="product-detail__specs mt-4 p-4 bg-muted rounded-lg border border-border">
            <h3 className="font-semibold mb-3 text-foreground">
                {t('product.specs')}
            </h3>
            <table className="w-full text-sm">
                <tbody>
                    <tr className="border-b border-border">
                        <td className="py-2 font-medium text-muted-foreground">
                            {t('product.spec.volume')}
                        </td>
                        <td className="py-2">{volume}</td>
                    </tr>
                    <tr className="border-b border-border">
                        <td className="py-2 font-medium text-muted-foreground">
                            {t('product.spec.type')}
                        </td>
                        <td className="py-2">{type}</td>
                    </tr>
                    <tr>
                        <td className="py-2 font-medium text-muted-foreground">
                            {t('product.spec.country')}
                        </td>
                        <td className="py-2">{country}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};
