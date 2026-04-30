import { PRODUCTS } from '../../../../data/products';
import dynamic from 'next/dynamic';
const ProductSkuInput = dynamic(() => import('./ProductSkuInput'), { ssr: false });
// Для SSG: генерируем пути для всех товаров
export function generateStaticParams() {
  return PRODUCTS.map((product) => ({ id: product.id }));
}
import { notFound } from 'next/navigation';
import { getProductById } from '../../../../data/products';

interface ProductPageProps {
  params: { id: string };
}

export default function ProductEditPage({ params }: ProductPageProps) {
  const product = getProductById(params.id);
  if (!product) return notFound();

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Редактирование товара: {product.title || product.id}</h1>
      <div className="mb-4 flex flex-col gap-2">
        <div><span className="font-semibold">ID:</span> {product.id}</div>
        <ProductSkuInput productId={product.id} initialSku={product.sku} />
      </div>
      {/* Здесь будет форма редактирования товара */}
      <pre className="bg-gray-100 p-4 rounded text-xs overflow-x-auto">{JSON.stringify(product, null, 2)}</pre>
    </main>
  );
}
