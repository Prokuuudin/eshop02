'use client';

import React from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AddProductFormValues } from './productFormSchema';

const ProductRelatedFields: React.FC = () => {
    const { control, register } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'relatedProductIds' as never });

    return (
        <div className="add-product__section add-product__section--related">
            <h2 className="add-product__section-title">Похожие товары</h2>
            <div className="flex flex-col gap-2">
                {(fields as { id: string }[]).map((field, idx) => (
                    <div key={field.id} className="flex gap-2">
                        <Input
                            placeholder="ID товара (например: p5)"
                            {...register(`relatedProductIds.${idx}` as const)}
                        />
                        <Button type="button" variant="destructive" size="sm" onClick={() => remove(idx)}>
                            ✕
                        </Button>
                    </div>
                ))}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start mt-1"
                    onClick={() => append('' as never)}
                >
                    + Добавить товар
                </Button>
            </div>
        </div>
    );
};

export default ProductRelatedFields;
