'use client';
import React from 'react';
import Image from 'next/image';
import { useBrandsConfig } from '@/lib/use-brands-config';

interface ProductBrandProps {
    brand: string;
}

export const ProductBrand: React.FC<ProductBrandProps> = ({ brand }) => {
    const { brands } = useBrandsConfig();
    if (!brand) return null;
    const brandObj = brands.find(
        (b) =>
            b.name.toLowerCase() === brand.toLowerCase() ||
            b.id.toLowerCase() === brand.toLowerCase()
    );
    return (
        <div className="product-detail__brand flex items-center gap-2 text-sm text-muted-foreground mb-1">
            {brandObj && brandObj.logo && brandObj.allowLogo && (
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
