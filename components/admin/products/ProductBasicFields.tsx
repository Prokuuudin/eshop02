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

const ProductBasicFields: React.FC = () => {
    const {
        register,
        formState: { errors },
        control,
    } = useFormContext<AddProductFormValues>();
    const { t } = useTranslation();
    const { isEdit } = useProductFormMode();

    return (
        <div className="add-product__section add-product__section--basic">
            <h2 className="add-product__section-title">Основная информация</h2>
            <div className="add-product__fields-grid">
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-id">
                        ID {isEdit && <span className="text-muted-foreground text-xs">(нельзя изменить)</span>}
                    </label>
                    <Input
                        id="add-product-id"
                        placeholder="Уникальный идентификатор, например: p123"
                        disabled={isEdit}
                        {...register('id')}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-brand">
                        Бренд
                    </label>
                    <Input
                        id="add-product-brand"
                        placeholder="Бренд товара"
                        {...register('brand')}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-sku">
                        SKU
                    </label>
                    <Input id="add-product-sku" placeholder="Артикул товара" {...register('sku')} />
                </div>
                <div>
                    <label
                        className="block text-sm font-medium mb-1"
                        htmlFor="add-product-category"
                    >
                        Категория
                    </label>
                    <Controller
                        name="category"
                        control={control}
                        render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger id="add-product-category">
                                    <SelectValue placeholder="Выберите категорию" />
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
                        Штрихкод
                    </label>
                    <Input
                        id="add-product-barcode"
                        placeholder="Штрихкод (EAN, UPC)"
                        {...register('barcode')}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-status">
                        Видимость на витрине
                    </label>
                    <Controller
                        name="status"
                        control={control}
                        render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger id="add-product-status">
                                    <SelectValue placeholder="Выберите видимость" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Активен — виден в каталоге</SelectItem>
                                    <SelectItem value="hidden">Скрыт — не показывается покупателям</SelectItem>
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
