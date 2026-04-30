import React from 'react';
import type { Product } from '@/data/products';
import { Button } from '@/components/ui/button';

interface ProductTableProps {
    products: Product[];
    onEditProduct?: (product: Product) => void;
    onDeleteProduct?: (product: Product) => void;
}

const ProductTable: React.FC<ProductTableProps> = ({
    products,
    onEditProduct,
    onDeleteProduct,
}) => (
    <div className="overflow-x-auto">
        <table className="admin-products__table min-w-full border border-gray-200 dark:border-gray-700 rounded-lg">
            <thead>
                <tr className="bg-gray-100 dark:bg-gray-800">
                    <th className="p-3 text-left font-semibold text-sm text-gray-700 dark:text-gray-200">
                        Картинка
                    </th>
                    <th className="p-3 text-left font-semibold text-sm text-gray-700 dark:text-gray-200">
                        Название
                    </th>
                    <th className="p-3 text-left font-semibold text-sm text-gray-700 dark:text-gray-200">
                        ID
                    </th>
                    <th className="p-3 text-left font-semibold text-sm text-gray-700 dark:text-gray-200">
                        SKU
                    </th>
                    <th className="p-3 text-left font-semibold text-sm text-gray-700 dark:text-gray-200">
                        Редактировать
                    </th>
                    <th className="p-3 text-left font-semibold text-sm text-gray-700 dark:text-gray-200">
                        Удалить
                    </th>
                </tr>
            </thead>
            <tbody>
                {products.map((product, idx) => (
                    <tr
                        key={product.id}
                        className={
                            idx % 2 === 0
                                ? 'bg-white dark:bg-gray-900'
                                : 'bg-gray-50 dark:bg-gray-800'
                        }
                    >
                        <td className="p-3 align-middle">
                            <div className="w-14 h-14 rounded overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                {product.image ? (
                                    <img
                                        src={product.image}
                                        alt={product.title}
                                        className="object-cover w-full h-full"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                                        no image
                                    </div>
                                )}
                            </div>
                        </td>
                        <td className="p-3 align-middle max-w-xs truncate font-medium text-gray-900 dark:text-gray-100">
                            {product.title}
                        </td>
                        <td className="p-3 align-middle text-xs text-gray-500 dark:text-gray-400">
                            {product.id}
                        </td>
                        <td className="p-3 align-middle text-xs text-gray-500 dark:text-gray-400">
                            {product.sku}
                        </td>
                        <td className="p-3 align-middle">
                            <Button size="sm" onClick={() => onEditProduct?.(product)}>
                                Редактировать
                            </Button>
                        </td>
                        <td className="p-3 align-middle">
                            <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => onDeleteProduct?.(product)}
                            >
                                Удалить
                            </Button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
        {products.length === 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 mt-4">
                Нет результатов поиска
            </div>
        )}
    </div>
);

export default ProductTable;
