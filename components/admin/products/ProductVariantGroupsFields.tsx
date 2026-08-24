'use client';

import React from 'react';
import { useFormContext, useFieldArray, Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AddProductFormValues } from './productFormSchema';
import { useAdminLocale } from '@/lib/use-admin-locale';

const VariantOptionsFields: React.FC<{ groupIndex: number }> = ({ groupIndex }) => {
    const { l } = useAdminLocale();
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
                        placeholder={l('Значение (напр.: A-11)', 'Value (e.g. A-11)', 'Vērtība (piem., A-11)')}
                        {...register(`variantGroups.${groupIndex}.options.${idx}.value`)}
                    />
                    <Input
                        className="w-40"
                        type="number"
                        step="0.01"
                        placeholder={l('Надбавка к цене, €', 'Price adjustment, €', 'Cenas piemaksa, €')}
                        {...register(`variantGroups.${groupIndex}.options.${idx}.priceAdjustment`, { valueAsNumber: true })}
                    />
                    <Input
                        className="flex-1 min-w-48"
                        placeholder={l('URL картинки опции', 'Option image URL', 'Opcijas attēla URL')}
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
                        {l('По умолчанию', 'Default', 'Noklusējums')}
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
                + {l('Добавить значение', 'Add value', 'Pievienot vērtību')}
            </Button>
        </div>
    );
};

const ProductVariantGroupsFields: React.FC = () => {
    const { l } = useAdminLocale();
    const { control, register } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'variantGroups' });

    return (
        <div className="add-product__section add-product__section--variants">
            <h2 className="add-product__section-title">{l('Варианты (цвет / комплектация)', 'Variants (color / configuration)', 'Varianti (krāsa / komplektācija)')}</h2>
            <div className="flex flex-col gap-4">
                {fields.map((field, idx) => (
                    <div key={field.id} className="border border-border rounded-lg p-3">
                        <div className="flex gap-2 items-center">
                            <Input
                                placeholder={l('Название группы (напр.: Номер цвета)', 'Group name (e.g. Color number)', 'Grupas nosaukums (piem., Krāsas numurs)')}
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
                                {l('Обязательно', 'Required', 'Obligāti')}
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
                                {l('Плитки с картинками', 'Image tiles', 'Attēlu flīzes')}
                            </label>
                            <Button type="button" variant="destructive" size="sm" onClick={() => remove(idx)}>
                                ✕ {l('Удалить группу', 'Delete group', 'Dzēst grupu')}
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
                    + {l('Добавить группу вариантов', 'Add variant group', 'Pievienot variantu grupu')}
                </Button>
            </div>
        </div>
    );
};

export default ProductVariantGroupsFields;
