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
        <div className="product-detail__specs mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold mb-3 text-gray-900 dark:text-gray-100">
                {t('product.specs')}
            </h3>
            <table className="w-full text-sm">
                <tbody>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                        <td className="py-2 font-medium text-gray-600 dark:text-gray-300">
                            {t('product.spec.volume')}
                        </td>
                        <td className="py-2">{volume}</td>
                    </tr>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                        <td className="py-2 font-medium text-gray-600 dark:text-gray-300">
                            {t('product.spec.type')}
                        </td>
                        <td className="py-2">{type}</td>
                    </tr>
                    <tr>
                        <td className="py-2 font-medium text-gray-600 dark:text-gray-300">
                            {t('product.spec.country')}
                        </td>
                        <td className="py-2">{country}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};
