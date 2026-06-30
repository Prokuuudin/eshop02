import React from 'react';
import { ProductGallery } from '@/components/ProductGallery';
import { ProductImageDisclaimer } from '@/components/ProductImageDisclaimer';
import { ProductBenefits } from '@/components/ProductBenefits';
import { ProductSpecs } from '@/components/ProductSpecs';
import { ManufacturerDistributorInfo } from '@/components/ManufacturerDistributorInfo';

import type { BrandManufacturerInfo } from '@/lib/brands-config';

interface ProductGalleryBlockProps {
    images: string[];
    demoVideos: any[];
    title: string;
    productSpecVolume: string;
    productSpecType: string;
    productSpecCountry: string;
    language: string;
    manufacturer?: BrandManufacturerInfo;
    distributor?: BrandManufacturerInfo;
}

export const ProductGalleryBlock: React.FC<ProductGalleryBlockProps> = ({
    images,
    demoVideos,
    title,
    productSpecVolume,
    productSpecType,
    productSpecCountry,
    language,
    manufacturer,
    distributor,
}) => {
    return (
        <div className="flex flex-col gap-4">
            <ProductGallery images={images} demoVideos={demoVideos} title={title} />
            <ProductImageDisclaimer />
            <ProductSpecs
                volume={productSpecVolume}
                type={productSpecType}
                country={productSpecCountry}
            />
            <ManufacturerDistributorInfo
                manufacturer={manufacturer}
                distributor={distributor}
                language={language}
            />
        </div>
    );
};
