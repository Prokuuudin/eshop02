import { notFound } from 'next/navigation';
import { getProductById } from '../../../../data/products';
import { generateStaticParams } from './generateStaticParams';
import ProductEditPage from './page';

export { generateStaticParams };

interface ProductPageProps {
    params: { id: string };
}

export default function ProductEditPageServer({ params }: ProductPageProps) {
    const product = getProductById(params.id);
    if (!product) return notFound();
    return <ProductEditPage params={params} />;
}
