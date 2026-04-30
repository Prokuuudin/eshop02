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

const ProductBasicFields: React.FC = () => {
    const {
        register,
        formState: { errors },
        control,
    } = useFormContext<AddProductFormValues>();

    return (
        <div className="add-product__section add-product__section--basic">
            <h2 className="add-product__section-title">Основная информация</h2>
            <div className="add-product__fields-grid">
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-title">
                        Название
                    </label>
                    <Input
                        id="add-product-title"
                        placeholder="Название товара"
                        {...register('titles.ru')}
                        error={errors.titles?.ru?.message}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-id">
                        ID / Слаг
                    </label>
                    <Input
                        id="add-product-id"
                        placeholder="Уникальный идентификатор, например: p123"
                        {...register('id')}
                        error={errors.id?.message}
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
                        error={errors.brand?.message}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-sku">
                        SKU
                    </label>
                    <Input
                        id="add-product-sku"
                        placeholder="Артикул товара"
                        {...register('sku')}
                        error={errors.sku?.message}
                    />
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
                                    {require('@/data/categories').CATEGORY_CARDS.map((cat: any) => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                            {cat.id}
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
                        error={errors.barcode?.message}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-purpose">
                        Назначение
                    </label>
                    <Controller
                        name="purpose"
                        control={control}
                        render={({ field }) => {
                            // Получаем уникальные значения назначений из products
                            const purposes = Array.from(
                                new Set(
                                    require('@/data/products')
                                        .PRODUCTS.map((p: any) => p.purpose)
                                        .filter((v: string | undefined) => !!v)
                                )
                            );
                            return (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger id="add-product-purpose">
                                        <SelectValue placeholder="Выберите назначение" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {purposes.map((purpose: string) => (
                                            <SelectItem key={purpose} value={purpose}>
                                                {purpose}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            );
                        }}
                    />
                    {errors.purpose?.message && (
                        <div className="text-red-500 text-xs mt-1">{errors.purpose.message}</div>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-type">
                        Тип продукта
                    </label>
                    <Input
                        id="add-product-type"
                        placeholder="Тип, например: крем, шампунь"
                        {...register('type')}
                        error={errors.type?.message}
                    />
                </div>
            </div>
        </div>
    );
};
export default ProductBasicFields;
