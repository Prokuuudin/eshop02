import React from 'react';
import { ProductGallery } from '@/components/ProductGallery';
import { ProductImageDisclaimer } from '@/components/ProductImageDisclaimer';
import { ProductBenefits } from '@/components/ProductBenefits';
import { ProductSpecs } from '@/components/ProductSpecs';
import { ManufacturerDistributorInfo } from '@/components/ManufacturerDistributorInfo';

import { Product } from '@/data/products';

interface ProductGalleryBlockProps {
    images: string[];
    demoVideos: any[];
    title: string;
    productSpecVolume: string;
    productSpecType: string;
    productSpecCountry: string;
    brandId: string;
    language: string;
    product: Product;
}

export const ProductGalleryBlock: React.FC<ProductGalleryBlockProps> = ({
    images,
    demoVideos,
    title,
    productSpecVolume,
    productSpecType,
    productSpecCountry,
    brandId,
    language,
    product,
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
            <ManufacturerDistributorInfo product={product} brandId={brandId} language={language} />
        </div>
    );
};
