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
                    label="Количество на складе"
                    placeholder="Сколько штук на складе"
                    type="number"
                    {...register('stock', { valueAsNumber: true })}
                    error={errors.stock?.message}
                />
                <Input
                    label="Мин. заказ"
                    placeholder="Минимальный заказ, например: 1"
                    type="number"
                    {...register('minOrder', { valueAsNumber: true })}
                    error={errors.minOrder?.message}
                />
                <Input
                    label="Единица измерения"
                    placeholder="шт, л, кг и т.д."
                    {...register('unit')}
                    error={errors.unit?.message}
                />
            </div>
        </div>
    );
};

export default ProductInventoryFields;
