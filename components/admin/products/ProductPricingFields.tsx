import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { AddProductFormValues } from './productFormSchema';

const ProductPricingFields: React.FC = () => {
    const { register, formState: { errors } } = useFormContext<AddProductFormValues>();

    return (
        <div className="add-product__section add-product__section--pricing">
            <h2 className="add-product__section-title">Цена</h2>
            <div className="add-product__fields-grid">
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-price">
                        Цена (EUR)
                    </label>
                    <Input
                        id="add-product-price"
                        placeholder="Например: 19.90"
                        type="number"
                        step="0.01"
                        {...register('price', { valueAsNumber: true })}
                    />
                    {errors.price?.message && (
                        <div className="text-red-500 text-xs mt-1">{errors.price.message}</div>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-oldprice">
                        Старая цена (если есть скидка)
                    </label>
                    <Input
                        id="add-product-oldprice"
                        placeholder="Например: 24.90"
                        type="number"
                        step="0.01"
                        {...register('oldPrice', {
                            setValueAs: (value) => value === '' ? undefined : Number(value),
                        })}
                    />
                </div>
            </div>
        </div>
    );
};

export default ProductPricingFields;
