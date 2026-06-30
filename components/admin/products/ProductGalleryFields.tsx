'use client';

import React from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AddProductFormValues } from './productFormSchema';

const ProductGalleryFields: React.FC = () => {
    const { register, control, formState: { errors } } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'images' as never });

    return (
        <div className="add-product__section add-product__section--gallery">
            <h2 className="add-product__section-title">Изображения</h2>
            <div className="add-product__fields-grid">
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-image">
                        Главное изображение (URL)
                    </label>
                    <Input
                        id="add-product-image"
                        placeholder="https://example.com/image.jpg"
                        {...register('image')}
                    />
                    {errors.image?.message && (
                        <div className="text-red-500 text-xs mt-1">{errors.image.message}</div>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium mb-2">Галерея</label>
                    <div className="flex flex-col gap-2">
                        {(fields as { id: string }[]).map((field, index) => (
                            <div key={field.id} className="flex gap-2">
                                <Input
                                    placeholder={`Изображение ${index + 1} (URL)`}
                                    {...register(`images.${index}` as const)}
                                />
                                <Button type="button" variant="destructive" size="sm" onClick={() => remove(index)}>
                                    ✕
                                </Button>
                            </div>
                        ))}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-1 self-start"
                            onClick={() => append('' as never)}
                        >
                            + Добавить изображение
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductGalleryFields;
