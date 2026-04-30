import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { AddProductFormValues } from './productFormSchema';

const ProductPricingFields: React.FC = () => {
    const {
        register,
        formState: { errors },
        control,
    } = useFormContext<AddProductFormValues>();

    return (
        <div className="add-product__section add-product__section--pricing">
            <div className="add-product__fields-grid">
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-price">
                        Цена
                    </label>
                    <Input
                        id="add-product-price"
                        placeholder="Цена, например: 1990"
                        type="number"
                        step="0.01"
                        {...register('price', { valueAsNumber: true })}
                        error={errors.price?.message}
                    />
                </div>
                <div>
                    <label
                        className="block text-sm font-medium mb-1"
                        htmlFor="add-product-oldprice"
                    >
                        Старая цена (если есть)
                    </label>
                    <Input
                        id="add-product-oldprice"
                        placeholder="Старая цена, если есть скидка"
                        type="number"
                        step="0.01"
                        {...register('oldPrice', { valueAsNumber: true })}
                        error={errors.oldPrice?.message}
                    />
                </div>
                <Input
                    label="Валюта"
                    placeholder="EUR, USD..."
                    {...register('currency')}
                    error={errors.currency?.message}
                />
                <div>
                    <label className="flex items-center gap-2">
                        <Controller
                            name="vatIncluded"
                            control={control}
                            render={({ field }) => (
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                            )}
                        />
                        <span>Включая НДС</span>
                    </label>
                </div>
                {/* Bulk pricing, etc. */}
            </div>
        </div>
    );
};

export default ProductPricingFields;
