import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { AddProductFormValues } from './productFormSchema';

const ProductInventoryFields: React.FC = () => {
    const {
        register,
        formState: { errors },
    } = useFormContext<AddProductFormValues>();

    return (
        <div className="add-product__section add-product__section--inventory">
            <h2 className="add-product__section-title">Склад и наличие</h2>
            <div className="add-product__fields-grid">
                <Input
                    placeholder="Сколько штук на складе"
                    type="number"
                    {...register('stock', { valueAsNumber: true })}
                />
                <Input
                    placeholder="Минимальный заказ, например: 1"
                    type="number"
                    {...register('minOrder', { valueAsNumber: true })}
                />
                <Input placeholder="шт, л, кг и т.д." {...register('unit')} />
            </div>
        </div>
    );
};

export default ProductInventoryFields;
