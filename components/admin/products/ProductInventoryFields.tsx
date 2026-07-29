import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { AddProductFormValues } from './productFormSchema';

const ProductInventoryFields: React.FC = () => {
    const { register } = useFormContext<AddProductFormValues>();

    return (
        <div className="add-product__section add-product__section--inventory">
            <h2 className="add-product__section-title">Склад и наличие</h2>
            <div className="add-product__fields-grid">
                <div>
                    <label htmlFor="product-stock" className="block text-sm font-medium mb-1">Остаток на складе</label>
                    <Input
                        id="product-stock"
                        placeholder="Количество штук"
                        type="number"
                        {...register('stock', { valueAsNumber: true })}
                    />
                </div>
                <div>
                    <label htmlFor="product-min-order" className="block text-sm font-medium mb-1">Минимальный заказ</label>
                    <Input
                        id="product-min-order"
                        placeholder="Например: 1"
                        type="number"
                        {...register('minOrder', { valueAsNumber: true })}
                    />
                </div>
            </div>
        </div>
    );
};

export default ProductInventoryFields;
