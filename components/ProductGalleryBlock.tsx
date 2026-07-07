import React from 'react';
import { ProductGallery } from '@/components/ProductGallery';
import { ProductImageDisclaimer } from '@/components/ProductImageDisclaimer';
import { ProductDescription } from '@/components/ProductDescription';
import { ProductSpecs } from '@/components/ProductSpecs';
import { ManufacturerDistributorInfo } from '@/components/ManufacturerDistributorInfo';
import TechnicalSpecs from '@/components/TechnicalSpecs';

import type { BrandManufacturerInfo } from '@/lib/brands-config';
import type { Product } from '@/data/products';

interface ProductGalleryBlockProps {
    product: Product;
    images: string[];
    demoVideos: any[];
    title: string;
    productDescription: string;
    productSpecVolume: string;
    productSpecType: string;
    productSpecCountry: string;
    language: string;
    manufacturer?: BrandManufacturerInfo;
    distributor?: BrandManufacturerInfo;
}

export const ProductGalleryBlock: React.FC<ProductGalleryBlockProps> = ({
    product,
    images,
    demoVideos,
    title,
    productDescription,
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
            <ProductDescription description={productDescription} productId={product.id} />
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
            <TechnicalSpecs product={product} />
        </div>
    );
};
