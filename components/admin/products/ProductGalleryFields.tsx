import React from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AddProductFormValues } from './productFormSchema';

const ProductGalleryFields: React.FC = () => {
    const {
        control,
        register,
        formState: { errors },
    } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'gallery' });

    return (
        <div className="add-product__section add-product__section--gallery">
            <h2 className="add-product__section-title">Галерея изображений</h2>
            <div className="add-product__fields-grid">
                {fields.map((field, idx) => (
                    <div
                        key={field.id}
                        className="add-product__gallery-item flex gap-2 items-center"
                    >
                        <Input
                            label={`Изображение #${idx + 1}`}
                            placeholder="URL изображения"
                            {...register(`gallery.${idx}`)}
                            error={errors.gallery?.[idx]?.message}
                            className="add-product__input add-product__input--gallery"
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
                    Добавить изображение
                </Button>
            </div>
        </div>
    );
};

export default ProductGalleryFields;
