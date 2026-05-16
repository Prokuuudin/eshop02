import React from 'react';
import Image from 'next/image';
import { BRANDS, Brand } from '@/data/brands';

interface ProductBrandProps {
    brand: string;
}

export const ProductBrand: React.FC<ProductBrandProps> = ({ brand }) => {
    if (!brand) return null;
    const brandObj = BRANDS.find(
        (b: Brand) =>
            b.name.toLowerCase() === brand.toLowerCase() ||
            b.id.toLowerCase() === brand.toLowerCase()
    );
    return (
        <div className="product-detail__brand flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300 mb-1">
            {brandObj && brandObj.logo && brandObj.allowLogo !== false && (
                <Image
                    src={brandObj.logo}
                    alt={brandObj.name}
                    width={192}
                    height={108}
                    className="inline-block align-middle object-contain border border-gray-300 dark:border-gray-600 rounded bg-white p-4"
                />
            )}
            {brand.toUpperCase()}
        </div>
    );
};
