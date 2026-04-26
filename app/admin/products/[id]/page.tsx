import { PRODUCTS } from '../../../../data/products';
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
      {/* Здесь будет форма редактирования товара */}
      <pre className="bg-gray-100 p-4 rounded text-xs overflow-x-auto">{JSON.stringify(product, null, 2)}</pre>
    </main>
  );
}
