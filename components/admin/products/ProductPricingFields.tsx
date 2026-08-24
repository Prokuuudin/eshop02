import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { AddProductFormValues } from './productFormSchema';
import { useAdminLocale } from '@/lib/use-admin-locale';

const ProductPricingFields: React.FC = () => {
    const { l } = useAdminLocale();
    const { register, formState: { errors } } = useFormContext<AddProductFormValues>();

    return (
        <div className="add-product__section add-product__section--pricing">
            <h2 className="add-product__section-title">{l('Цена', 'Price', 'Cena')}</h2>
            <div className="add-product__fields-grid">
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-price">
                        {l('Цена', 'Price', 'Cena')} (EUR)
                    </label>
                    <Input
                        id="add-product-price"
                        placeholder={l('Например: 19.90', 'For example: 19.90', 'Piemēram: 19.90')}
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
                        {l('Старая цена (если есть скидка)', 'Old price (when discounted)', 'Vecā cena (ja ir atlaide)')}
                    </label>
                    <Input
                        id="add-product-oldprice"
                        placeholder={l('Например: 24.90', 'For example: 24.90', 'Piemēram: 24.90')}
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
