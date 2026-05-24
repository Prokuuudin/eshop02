'use client';

import React from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AddProductFormValues } from './productFormSchema';

const ProductTechSpecsFields: React.FC = () => {
    const { control, register } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'technicalSpecs' });
    const equip = useFieldArray({ control, name: 'compatibleEquipment' as never });

    return (
        <div className="add-product__section add-product__section--techspecs">
            <h2 className="add-product__section-title">Технические характеристики</h2>
            <div className="add-product__fields-grid">
                <div>
                    <label className="block text-sm font-medium mb-2">Характеристики (ключ — значение)</label>
                    <div className="flex flex-col gap-2">
                        {fields.map((field, idx) => (
                            <div key={field.id} className="flex gap-2">
                                <Input
                                    placeholder="Параметр (напр.: Объём)"
                                    {...register(`technicalSpecs.${idx}.key`)}
                                />
                                <Input
                                    placeholder="Значение (напр.: 250 мл)"
                                    {...register(`technicalSpecs.${idx}.value`)}
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
                            onClick={() => append({ key: '', value: '' })}
                        >
                            + Добавить характеристику
                        </Button>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-2">Совместимое оборудование</label>
                    <div className="flex flex-col gap-2">
                        {(equip.fields as { id: string }[]).map((field, idx) => (
                            <div key={field.id} className="flex gap-2">
                                <Input
                                    placeholder="Название оборудования"
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
                            className="self-start mt-1"
                            onClick={() => equip.append('' as never)}
                        >
                            + Добавить оборудование
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductTechSpecsFields;
