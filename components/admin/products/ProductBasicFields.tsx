'use client';

import React from 'react';

import { useFormContext, Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
} from '@/components/ui/select';
import { AddProductFormValues } from './productFormSchema';
import { CATEGORY_CARDS } from '@/data/categories';
import { useTranslation } from '@/lib/i18n-context';
import { useProductFormMode } from './ProductFormModeContext';
import { useAdminLocale } from '@/lib/use-admin-locale';

const ProductBasicFields: React.FC = () => {
    const {
        register,
        formState: { errors },
        control,
    } = useFormContext<AddProductFormValues>();
    const { t } = useTranslation();
    const { l } = useAdminLocale();
    const { isEdit } = useProductFormMode();

    return (
        <div className="add-product__section add-product__section--basic">
            <h2 className="add-product__section-title">{l('Основная информация', 'Basic information', 'Pamatinformācija')}</h2>
            <div className="add-product__fields-grid">
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-id">
                        ID {isEdit && <span className="text-muted-foreground text-xs">{l('(нельзя изменить)', '(cannot be changed)', '(nevar mainīt)')}</span>}
                    </label>
                    <Input
                        id="add-product-id"
                        placeholder={l('Уникальный идентификатор, например: p123', 'Unique identifier, for example: p123', 'Unikāls identifikators, piemēram: p123')}
                        disabled={isEdit}
                        {...register('id')}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-brand">
                        {l('Бренд', 'Brand', 'Zīmols')}
                    </label>
                    <Input
                        id="add-product-brand"
                        placeholder={l('Бренд товара', 'Product brand', 'Preces zīmols')}
                        {...register('brand')}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-sku">
                        SKU
                    </label>
                    <Input id="add-product-sku" placeholder={l('Артикул товара', 'Product SKU', 'Preces artikuls')} {...register('sku')} />
                </div>
                <div>
                    <label
                        className="block text-sm font-medium mb-1"
                        htmlFor="add-product-category"
                    >
                        {l('Категория', 'Category', 'Kategorija')}
                    </label>
                    <Controller
                        name="category"
                        control={control}
                        render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger id="add-product-category">
                                    <SelectValue placeholder={l('Выберите категорию', 'Select a category', 'Izvēlieties kategoriju')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {CATEGORY_CARDS.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                            {t(cat.titleKey) || cat.id}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    />
                    {errors.category?.message && (
                        <div className="text-red-500 text-xs mt-1">{errors.category.message}</div>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-barcode">
                        {l('Штрихкод', 'Barcode', 'Svītrkods')}
                    </label>
                    <Input
                        id="add-product-barcode"
                        placeholder={l('Штрихкод (EAN, UPC)', 'Barcode (EAN, UPC)', 'Svītrkods (EAN, UPC)')}
                        {...register('barcode')}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-status">
                        {l('Видимость на витрине', 'Storefront visibility', 'Redzamība veikalā')}
                    </label>
                    <Controller
                        name="status"
                        control={control}
                        render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger id="add-product-status">
                                    <SelectValue placeholder={l('Выберите видимость', 'Select visibility', 'Izvēlieties redzamību')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">{l('Активен — виден в каталоге', 'Active — visible in catalog', 'Aktīvs — redzams katalogā')}</SelectItem>
                                    <SelectItem value="hidden">{l('Скрыт — не показывается покупателям', 'Hidden — not shown to customers', 'Paslēpts — netiek rādīts klientiem')}</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    />
                </div>
            </div>
        </div>
    );
};
export default ProductBasicFields;
