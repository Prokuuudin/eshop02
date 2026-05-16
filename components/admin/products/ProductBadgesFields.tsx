import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AddProductFormValues } from './productFormSchema';

const BADGE_OPTIONS = [
    { value: 'sale', label: 'sale', className: 'bg-red-600 text-white' },
    { value: 'new', label: 'new', className: 'bg-green-600 text-white' },
    { value: 'bestseller', label: 'bestseller', className: 'bg-yellow-600 text-black' },
];

const ProductBadgesFields: React.FC = () => {
    const { control } = useFormContext<AddProductFormValues>();

    return (
        <div className="add-product__section add-product__section--badges">
            <h2 className="add-product__section-title">Бейджи</h2>
            <div className="add-product__fields-grid flex gap-4">
                <Controller
                    name="labels"
                    control={control}
                    render={({ field }) => (
                        <div className="flex gap-3">
                            {BADGE_OPTIONS.map((badge) => (
                                <label
                                    key={badge.value}
                                    className="flex items-center gap-2 cursor-pointer"
                                >
                                    <Checkbox
                                        checked={field.value?.includes(
                                            badge.value as
                                                | 'sale'
                                                | 'bestseller'
                                                | 'new'
                                                | 'pro'
                                                | 'limited'
                                        )}
                                        onCheckedChange={(checked) => {
                                            if (checked) {
                                                field.onChange([
                                                    ...(field.value || []),
                                                    badge.value,
                                                ]);
                                            } else {
                                                field.onChange(
                                                    (field.value || []).filter(
                                                        (v: string) => v !== badge.value
                                                    )
                                                );
                                            }
                                        }}
                                    />
                                    <Badge className={badge.className}>{badge.label}</Badge>
                                </label>
                            ))}
                        </div>
                    )}
                />
            </div>
        </div>
    );
};

export default ProductBadgesFields;
