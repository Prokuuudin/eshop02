'use client';

import React from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AddProductFormValues } from './productFormSchema';

const ProductCertificatesFields: React.FC = () => {
    const { control, register } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'certificates' as never });

    return (
        <div className="add-product__section add-product__section--certificates">
            <h2 className="add-product__section-title">Сертификаты</h2>
            <div className="flex flex-col gap-2">
                {(fields as { id: string }[]).map((field, idx) => (
                    <div key={field.id} className="flex gap-2">
                        <Input
                            placeholder="URL к PDF сертификата"
                            {...register(`certificates.${idx}` as const)}
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
                    className="add-product__option-add"
                    onClick={() => append('' as never)}
                >
                    + Добавить сертификат
                </Button>
            </div>
        </div>
    );
};

export default ProductCertificatesFields;
