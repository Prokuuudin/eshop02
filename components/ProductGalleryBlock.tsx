import React from 'react';
import { ProductGallery } from '@/components/ProductGallery';
import { ProductImageDisclaimer } from '@/components/ProductImageDisclaimer';
import { ProductDescription } from '@/components/ProductDescription';
import { ProductSpecs } from '@/components/ProductSpecs';
import { ManufacturerDistributorInfo } from '@/components/ManufacturerDistributorInfo';
import TechnicalSpecs from '@/components/TechnicalSpecs';
import Certificates from '@/components/Certificates';

import type { BrandManufacturerInfo } from '@/lib/brands-config';
import type { Product } from '@/data/products';
import { getProductIngredients } from '@/lib/product-ingredients';

interface ProductGalleryBlockProps {
    product: Product;
    images: string[];
    demoVideos: any[];
    title: string;
    productDescription: string;
    productFeatures: string[];
    productSpecVolume: string;
    productSpecType: string;
    productSpecCountry: string;
    productPurpose?: string;
    productApplication?: string;
    productWarnings?: string;
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
    productFeatures,
    productSpecVolume,
    productSpecType,
    productSpecCountry,
    productPurpose,
    productApplication,
    productWarnings,
    language,
    manufacturer,
    distributor,
}) => {
    // Поля товара приоритетнее данных бренда из brands-config: если админ заполнил
    // производителя/дистрибьютора в карточке товара, показываем их.
    const lang = (['ru', 'en', 'lv'].includes(language) ? language : 'ru') as 'ru' | 'en' | 'lv';
    const productManufacturer: BrandManufacturerInfo | undefined =
        product.manufacturerName || product.manufacturerAddress || product.manufacturerEmail
            ? {
                  name: product.manufacturerName ?? '',
                  address: product.manufacturerAddress ?? '',
                  email: product.manufacturerEmail,
              }
            : undefined;
    const productDistributor: BrandManufacturerInfo | undefined =
        product.distributorName?.[lang] || product.distributorAddress?.[lang] || product.distributorEmail
            ? {
                  name: product.distributorName?.[lang] ?? '',
                  address: product.distributorAddress?.[lang] ?? '',
                  email: product.distributorEmail,
              }
            : undefined;

    return (
        <div className="flex flex-col gap-4">
            <ProductGallery images={images} demoVideos={demoVideos} title={title} />
            <ProductImageDisclaimer />
            <ProductDescription
                description={productDescription}
                features={productFeatures}
                ingredients={getProductIngredients(product)}
                application={productApplication}
                warnings={productWarnings}
                productId={product.id}
            />
            <ProductSpecs
                volume={productSpecVolume}
                type={productSpecType}
                country={productSpecCountry}
                purpose={productPurpose}
                unitOfMeasure={product.unitOfMeasure}
                packagingSize={product.packagingSize}
            />
            <ManufacturerDistributorInfo
                manufacturer={productManufacturer ?? manufacturer}
                distributor={productDistributor ?? distributor}
                language={language}
            />
            <TechnicalSpecs product={product} />
            <Certificates product={product} />
        </div>
    );
};
