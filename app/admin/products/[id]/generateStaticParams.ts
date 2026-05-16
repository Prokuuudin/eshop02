import { PRODUCTS } from '../../../../data/products';

export function generateStaticParams() {
  return PRODUCTS.map((product) => ({ id: product.id }));
}
