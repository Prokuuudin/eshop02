import { notFound } from 'next/navigation';
import { getAdminProducts } from '@/lib/product-overrides-store';
import { mapProductToFormValues } from '@/lib/product-form-mapping';
import ProductEditPageContent from './ProductEditPageContent';

interface PageProps {
    params: Promise<{ id: string }>;
}

export const revalidate = 0;

export default async function ProductEditPage({ params }: PageProps): Promise<React.ReactElement> {
    const { id } = await params;
    const products = await getAdminProducts();
    const product = products.find((p) => p.id === id);

    if (!product) return notFound();

    const initialValues = mapProductToFormValues(product);

    return (
        <ProductEditPageContent
            productId={product.id}
            productTitle={product.title}
            initialValues={initialValues}
            revision={product.revision ?? 1}
        />
    );
}
