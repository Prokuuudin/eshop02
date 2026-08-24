'use client';

import React from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AddProductFormValues } from './productFormSchema';
import { useAdminLocale } from '@/lib/use-admin-locale';

// Свободный список «Характеристики (ключ — значение)» здесь больше не редактируется:
// на странице товара блок убран, а сами данные technicalSpecs по-прежнему хранятся
// и проходят насквозь через reservedTechSpecs (см. lib/product-form-mapping.ts) —
// ничего не теряется, просто нет формы для правки. compatibleEquipment остаётся:
// отдаётся во внешний /api/v1/products.
const ProductTechSpecsFields: React.FC = () => {
    const { l } = useAdminLocale();
    const { register, control } = useFormContext<AddProductFormValues>();
    const equip = useFieldArray({ control, name: 'compatibleEquipment' as never });

    return (
        <div className="add-product__section add-product__section--techspecs">
            <h2 className="add-product__section-title">{l('Совместимое оборудование', 'Compatible equipment', 'Saderīgs aprīkojums')}</h2>
            <div className="add-product__fields-grid">
                <div>
                    <div className="flex flex-col gap-2">
                        {(equip.fields as { id: string }[]).map((field, idx) => (
                            <div key={field.id} className="flex gap-2">
                                <Input
                                    placeholder={l('Название оборудования', 'Equipment name', 'Aprīkojuma nosaukums')}
                                    {...register(`compatibleEquipment.${idx}` as const)}
                                />
                                <Button type="button" variant="destructive" size="sm" onClick={() => equip.remove(idx)}>
                                    ✕
                                </Button>
                            </div>
                        ))}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="add-product__option-add"
                            onClick={() => equip.append('' as never)}
                        >
                            + {l('Добавить оборудование', 'Add equipment', 'Pievienot aprīkojumu')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductTechSpecsFields;
