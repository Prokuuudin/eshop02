import { notFound } from 'next/navigation';
import { getAdminProducts } from '@/lib/product-overrides-store';
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
    const products = await getAdminProducts();
    const product = products.find((p) => p.id === id);

    if (!product) return notFound();

    const initialValues = mapProductToFormValues(product);
    const normalizeMeta = (value: string | null | undefined): string => value?.trim().toLowerCase() ?? '';
    const metaTitle = normalizeMeta(product.metaTitle);
    const metaDescription = normalizeMeta(product.metaDescription);
    const duplicateMetaTitle = Boolean(metaTitle && products.some((candidate) => candidate.id !== product.id && normalizeMeta(candidate.metaTitle) === metaTitle));
    const duplicateMetaDescription = Boolean(metaDescription && products.some((candidate) => candidate.id !== product.id && normalizeMeta(candidate.metaDescription) === metaDescription));
    const requestedReturnTo = query.from === 'seo' ? query.returnTo : undefined;
    const returnTo = requestedReturnTo === '/admin/analytics' || requestedReturnTo?.startsWith('/admin/analytics?') || requestedReturnTo?.startsWith('/admin/analytics#')
        ? requestedReturnTo
        : undefined;

    return (
        <ProductEditPageContent
            productId={product.id}
            productTitle={product.title}
            initialValues={initialValues}
            revision={product.revision ?? 1}
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
