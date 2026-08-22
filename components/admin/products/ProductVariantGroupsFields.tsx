'use client';

import React from 'react';
import { useFormContext, useFieldArray, Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AddProductFormValues } from './productFormSchema';

const VariantOptionsFields: React.FC<{ groupIndex: number }> = ({ groupIndex }) => {
    const { control, register } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({
        control,
        name: `variantGroups.${groupIndex}.options`,
    });

    return (
        <div className="flex flex-col gap-2 mt-2 pl-4 border-l border-border">
            {fields.map((field, idx) => (
                <div key={field.id} className="flex gap-2 items-center flex-wrap">
                    <Input
                        className="w-40"
                        placeholder="Значение (напр.: A-11)"
                        {...register(`variantGroups.${groupIndex}.options.${idx}.value`)}
                    />
                    <Input
                        className="w-40"
                        type="number"
                        step="0.01"
                        placeholder="Надбавка к цене, €"
                        {...register(`variantGroups.${groupIndex}.options.${idx}.priceAdjustment`, { valueAsNumber: true })}
                    />
                    <Input
                        className="flex-1 min-w-48"
                        placeholder="URL картинки опции"
                        {...register(`variantGroups.${groupIndex}.options.${idx}.image`)}
                    />
                    <label htmlFor={`variant-${groupIndex}-option-${idx}-preselected`} className="flex items-center gap-1.5 cursor-pointer text-sm whitespace-nowrap">
                        <Controller
                            control={control}
                            name={`variantGroups.${groupIndex}.options.${idx}.preselected`}
                            render={({ field: checkboxField }) => (
                                <Checkbox
                                    id={`variant-${groupIndex}-option-${idx}-preselected`}
                                    checked={checkboxField.value ?? false}
                                    onCheckedChange={checkboxField.onChange}
                                />
                            )}
                        />
                        По умолчанию
                    </label>
                    <Button type="button" variant="destructive" size="sm" onClick={() => remove(idx)}>
                        ✕
                    </Button>
                </div>
            ))}
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => append({ value: '', priceAdjustment: undefined })}
            >
                + Добавить значение
            </Button>
        </div>
    );
};

const ProductVariantGroupsFields: React.FC = () => {
    const { control, register } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'variantGroups' });

    return (
        <div className="add-product__section add-product__section--variants">
            <h2 className="add-product__section-title">Варианты (цвет / комплектация)</h2>
            <div className="flex flex-col gap-4">
                {fields.map((field, idx) => (
                    <div key={field.id} className="border border-border rounded-lg p-3">
                        <div className="flex gap-2 items-center">
                            <Input
                                placeholder="Название группы (напр.: Krāsu numurs)"
                                {...register(`variantGroups.${idx}.name`)}
                            />
                            <label htmlFor={`variant-${idx}-required`} className="flex items-center gap-2 cursor-pointer text-sm whitespace-nowrap">
                                <Controller
                                    control={control}
                                    name={`variantGroups.${idx}.required`}
                                    render={({ field: checkboxField }) => (
                                        <Checkbox
                                            id={`variant-${idx}-required`}
                                            checked={checkboxField.value}
                                            onCheckedChange={checkboxField.onChange}
                                        />
                                    )}
                                />
                                Обязательно
                            </label>
                            <label htmlFor={`variant-${idx}-image-squares`} className="flex items-center gap-2 cursor-pointer text-sm whitespace-nowrap">
                                <Controller
                                    control={control}
                                    name={`variantGroups.${idx}.displayType`}
                                    render={({ field: displayField }) => (
                                        <Checkbox
                                            id={`variant-${idx}-image-squares`}
                                            checked={displayField.value === 'imageSquares'}
                                            onCheckedChange={(checked) =>
                                                displayField.onChange(checked ? 'imageSquares' : undefined)
                                            }
                                        />
                                    )}
                                />
                                Плитки с картинками
                            </label>
                            <Button type="button" variant="destructive" size="sm" onClick={() => remove(idx)}>
                                ✕ Удалить группу
                            </Button>
                        </div>
                        <VariantOptionsFields groupIndex={idx} />
                    </div>
                ))}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="add-product__option-add"
                    onClick={() => append({ name: '', required: false, options: [] })}
                >
                    + Добавить группу вариантов
                </Button>
            </div>
        </div>
    );
};

export default ProductVariantGroupsFields;
