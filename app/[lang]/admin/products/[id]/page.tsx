import { notFound } from 'next/navigation';
import { getAdminProductById, getDuplicateProductMetadataFlags } from '@/lib/product-overrides-store';
import { mapProductToFormValues } from '@/lib/product-form-mapping';
import ProductEditPageContent from './ProductEditPageContent';

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ from?: string; returnTo?: string }>;
}

export const revalidate = 0;

export default async function ProductEditPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
    const { id } = await params;
    const query = await searchParams;
    const product = await getAdminProductById(id);

    if (!product) return notFound();

    const initialValues = mapProductToFormValues(product);
    const requestedReturnTo = query.from === 'seo' ? query.returnTo : undefined;
    const returnTo = requestedReturnTo === '/admin/analytics' || requestedReturnTo?.startsWith('/admin/analytics?') || requestedReturnTo?.startsWith('/admin/analytics#')
        ? requestedReturnTo
        : undefined;
    const { duplicateMetaTitle, duplicateMetaDescription } = returnTo
        ? await getDuplicateProductMetadataFlags(product.id, product.metaTitle, product.metaDescription)
        : { duplicateMetaTitle: false, duplicateMetaDescription: false };

    return (
        <ProductEditPageContent
            productId={product.id}
            productTitle={product.title}
            initialValues={initialValues}
            revision={product.revision ?? 1}
            erpPriceStatus={{
                price: product.price,
                erpPriceMissing: product.erpPriceMissing ?? false,
                manualPriceApproved: product.manualPriceApproved ?? false,
                manualApprovedPrice: product.manualApprovedPrice,
            }}
            seoContext={returnTo ? {
                returnTo,
                duplicateMetaTitle,
                duplicateMetaDescription,
                initialMetaTitle: product.metaTitle ?? '',
                initialMetaDescription: product.metaDescription ?? '',
            } : undefined}
        />
    );
}
