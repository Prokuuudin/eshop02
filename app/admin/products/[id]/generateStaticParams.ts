import { getMergedProducts } from '@/lib/product-overrides-store';

export async function generateStaticParams(): Promise<Array<{ id: string }>> {
    const products = await getMergedProducts();
    return products.map((p) => ({ id: p.id }));
}
