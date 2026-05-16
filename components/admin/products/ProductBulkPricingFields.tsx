import React from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AddProductFormValues } from './productFormSchema';

const ProductBulkPricingFields: React.FC = () => {
    const {
        control,
        register,
        formState: { errors },
    } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'bulkPricing' });

    return (
        <div className="add-product__section add-product__section--bulkpricing">
            <h2 className="add-product__section-title">Оптовое ценообразование</h2>
            <div className="add-product__fields-grid">
                {fields.map((field, idx) => (
                    <div key={field.id} className="add-product__bulk-row flex gap-2 items-center">
                        <Input
                            placeholder="Минимум для опта, например: 10"
                            type="number"
                            {...register(`bulkPricing.${idx}.minQty`, { valueAsNumber: true })}
                            className="add-product__input add-product__input--bulk-min"
                        />
                        <Input
                            placeholder="Цена для этого объёма"
                            type="number"
                            {...register(`bulkPricing.${idx}.price`, { valueAsNumber: true })}
                            className="add-product__input add-product__input--bulk-price"
                        />
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => remove(idx)}
                        >
                            Удалить
                        </Button>
                    </div>
                ))}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ minQty: 1, price: 0 })}
                >
                    Добавить оптовую цену
                </Button>
            </div>
        </div>
    );
};

export default ProductBulkPricingFields;
