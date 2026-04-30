import React from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AddProductFormValues } from './productFormSchema';

const ProductBoughtTogetherFields: React.FC = () => {
    const {
        control,
        register,
        formState: { errors },
    } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'boughtTogether' });

    return (
        <div className="add-product__section add-product__section--bought-together">
            <h2 className="add-product__section-title">Часто покупают вместе</h2>
            <div className="add-product__fields-grid">
                {fields.map((field, idx) => (
                    <div key={field.id} className="add-product__bought-row flex gap-2 items-center">
                        <Input
                            label={`ID товара #${idx + 1}`}
                            placeholder="ID часто покупаемого вместе товара"
                            {...register(`boughtTogether.${idx}`)}
                            error={errors.boughtTogether?.[idx]?.message}
                            className="add-product__input add-product__input--bought"
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
                <Button type="button" variant="outline" size="sm" onClick={() => append('')}>
                    Добавить товар
                </Button>
            </div>
        </div>
    );
};

export default ProductBoughtTogetherFields;
