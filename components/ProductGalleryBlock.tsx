import React from 'react';
import { ProductGallery } from '@/components/ProductGallery';
import { ProductVideoGallery } from '@/components/ProductVideoGallery';
import { ProductImageDisclaimer } from '@/components/ProductImageDisclaimer';
import { ProductDescription } from '@/components/ProductDescription';
import { ManufacturerDistributorInfo } from '@/components/ManufacturerDistributorInfo';
import Certificates from '@/components/Certificates';

import type { BrandManufacturerInfo } from '@/lib/brands-config';
import type { Product } from '@/data/products';
import { getProductIngredients } from '@/lib/product-ingredients';

interface ProductGalleryBlockProps {
    product: Product;
    images: string[];
    demoVideos: { src: string; poster?: string }[];
    title: string;
    productDescription: string;
    productFeatures: string[];
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
        <div className="contents md:flex md:flex-col md:gap-4">
            <div className="order-1 md:order-none">
                <ProductGallery images={images} title={title} />
            </div>
            {demoVideos.length > 0 && (
                <div className="order-3 md:order-none">
                    <ProductVideoGallery
                        demoVideos={demoVideos}
                        title={title}
                        fallbackPoster={images[0]}
                    />
                </div>
            )}
            <div className="order-5 md:order-none">
                <ProductImageDisclaimer />
            </div>
            <div className="order-4 md:order-none">
                <ProductDescription
                    description={productDescription}
                    features={productFeatures}
                    ingredients={getProductIngredients(product)}
                    application={productApplication}
                    warnings={productWarnings}
                    productId={product.id}
                />
            </div>
            <div className="order-5 md:order-none">
                <ManufacturerDistributorInfo
                    manufacturer={productManufacturer ?? manufacturer}
                    distributor={productDistributor ?? distributor}
                    language={language}
                />
            </div>
            <div className="order-5 md:order-none">
                <Certificates product={product} />
            </div>
        </div>
    );
};
