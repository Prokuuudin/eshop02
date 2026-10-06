import { notFound } from 'next/navigation';
import { hasAdminPermission } from '@/lib/admin-permissions';
import { getServerUser } from '@/lib/server-auth';
import { getAdminProductById, getDuplicateProductMetadataFlags } from '@/lib/product-overrides-store';
import { mapProductToFormValues } from '@/lib/product-form-mapping';
import ProductEditPageContent from './ProductEditPageContent';

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ from?: string; returnTo?: string }>;
}

export const revalidate = 0;

export default async function ProductEditPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
    // Authorize before any product read. The admin layout's redirect is not a data
    // boundary: Next renders the layout and this page in parallel, so without this
    // check the editor payload (prices, stock, ERP flags) streams to anyone.
    // Same permission as GET /api/admin/products.
    if (!hasAdminPermission(await getServerUser(), 'catalog.read')) return notFound();

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
