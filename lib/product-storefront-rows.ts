import { type Product } from '@/data/products';
import { Prisma } from '@/generated/prisma/client';
import { hasValidB2BPrice } from '@/lib/product-sellability';
import { getProductSubcategory } from '@/lib/product-overrides-mapping';

// Narrow storefront read projections and their pure row → Product mappers. Overrides,
// promo campaigns and price redaction are applied by lib/product-overrides-store.ts.

export const STOREFRONT_WHERE = { isDeleted: false, isActive: true } as const;

export const STOREFRONT_CARD_SELECT = {
    id: true, title: true, titleKey: true, titleEn: true, titleLv: true,
    brand: true, price: true, oldPrice: true, rating: true, image: true,
    badges: true, category: true, stock: true, createdAt: true, isActive: true,
    externalId: true, erpPriceMissing: true, manualPriceApproved: true,
    manualApprovedPrice: true, sku: true, minOrderQuantities: true,
    technicalSpecs: true, bulkPricingTiers: true,
} satisfies Prisma.ProductSelect;

export type StorefrontCardRow = Prisma.ProductGetPayload<{ select: typeof STOREFRONT_CARD_SELECT }>;

export const STOREFRONT_FILTER_INDEX_SELECT = {
    id: true, title: true, titleEn: true, titleLv: true, description: true,
    brand: true, sku: true, price: true, category: true, stock: true,
    createdAt: true, externalId: true, erpPriceMissing: true,
    manualPriceApproved: true, manualApprovedPrice: true,
} satisfies Prisma.ProductSelect;

export type StorefrontFilterIndexRow = Prisma.ProductGetPayload<{ select: typeof STOREFRONT_FILTER_INDEX_SELECT }>;

export const STOREFRONT_FACET_SELECT = {
    id: true, title: true, titleEn: true, titleLv: true, brand: true,
    price: true, oldPrice: true, rating: true, badges: true, category: true, stock: true,
    createdAt: true, externalId: true, erpPriceMissing: true,
    manualPriceApproved: true, manualApprovedPrice: true,
} satisfies Prisma.ProductSelect;

export type StorefrontFacetRow = Prisma.ProductGetPayload<{ select: typeof STOREFRONT_FACET_SELECT }>;

export function mapStorefrontCardRow(row: StorefrontCardRow): Product {
    return {
        id: row.id,
        title: row.title,
        titleKey: row.titleKey ?? undefined,
        titleEn: row.titleEn ?? undefined,
        titleLv: row.titleLv ?? undefined,
        brand: row.brand,
        price: Number(row.price),
        oldPrice: row.oldPrice === null ? undefined : Number(row.oldPrice),
        rating: row.rating,
        image: row.image ?? undefined,
        badges: row.badges as Product['badges'],
        category: row.category as Product['category'],
        subcategory: getProductSubcategory(row.id),
        stock: row.stock,
        createdAt: row.createdAt,
        isActive: row.isActive,
        erpPriceMissing: row.erpPriceMissing,
        manualPriceApproved: row.manualPriceApproved,
        manualApprovedPrice: row.manualApprovedPrice === null ? undefined : Number(row.manualApprovedPrice),
        ...(hasValidB2BPrice(row) ? {} : { priceUnavailable: true }),
        sku: row.sku ?? undefined,
        minOrderQuantities: (row.minOrderQuantities ?? undefined) as Product['minOrderQuantities'],
        technicalSpecs: (row.technicalSpecs ?? undefined) as Product['technicalSpecs'],
        bulkPricingTiers: (row.bulkPricingTiers ?? undefined) as Product['bulkPricingTiers'],
    };
}

export function mapStorefrontFilterIndexRow(row: StorefrontFilterIndexRow): Product {
    return {
        id: row.id,
        title: row.title,
        titleEn: row.titleEn ?? undefined,
        titleLv: row.titleLv ?? undefined,
        description: row.description ?? undefined,
        brand: row.brand,
        sku: row.sku ?? undefined,
        price: Number(row.price),
        rating: 0,
        category: row.category as Product['category'],
        subcategory: getProductSubcategory(row.id),
        stock: row.stock,
        createdAt: row.createdAt,
        erpPriceMissing: row.erpPriceMissing,
        manualPriceApproved: row.manualPriceApproved,
        manualApprovedPrice: row.manualApprovedPrice === null ? undefined : Number(row.manualApprovedPrice),
        ...(hasValidB2BPrice(row) ? {} : { priceUnavailable: true }),
    };
}

export function mapStorefrontFacetRow(row: StorefrontFacetRow): Product {
    return {
        id: row.id,
        title: row.title,
        titleEn: row.titleEn ?? undefined,
        titleLv: row.titleLv ?? undefined,
        brand: row.brand,
        price: Number(row.price),
        oldPrice: row.oldPrice === null ? undefined : Number(row.oldPrice),
        rating: row.rating,
        badges: row.badges as Product['badges'],
        category: row.category as Product['category'],
        subcategory: getProductSubcategory(row.id),
        stock: row.stock,
        createdAt: row.createdAt,
        erpPriceMissing: row.erpPriceMissing,
        manualPriceApproved: row.manualPriceApproved,
        manualApprovedPrice: row.manualApprovedPrice === null ? undefined : Number(row.manualApprovedPrice),
        ...(hasValidB2BPrice(row) ? {} : { priceUnavailable: true }),
    } as Product;
}
