import React from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AddProductFormValues } from './productFormSchema';

const ProductCertificatesFields: React.FC = () => {
    const {
        control,
        register,
        formState: { errors },
    } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'certificates' });

    return (
        <div className="add-product__section add-product__section--certificates">
            <h2 className="add-product__section-title">Сертификаты</h2>
            <div className="add-product__fields-grid">
                {fields.map((field, idx) => (
                    <div key={field.id} className="add-product__cert-row flex gap-2 items-center">
                        <Input
                            label={`Сертификат #${idx + 1} (URL)`}
                            placeholder="Ссылка на PDF или изображение сертификата"
                            {...register(`certificates.${idx}`)}
                            error={errors.certificates?.[idx]?.message}
                            className="add-product__input add-product__input--cert"
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
                    Добавить сертификат
                </Button>
            </div>
        </div>
    );
};

export default ProductCertificatesFields;
