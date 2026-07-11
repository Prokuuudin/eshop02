'use client';

import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AddProductFormValues, Language } from './productFormSchema';

interface ProductTranslationsFieldsProps {
    language: Language;
}

const ProductTranslationsFields: React.FC<ProductTranslationsFieldsProps> = ({ language }) => {
    const { register } = useFormContext<AddProductFormValues>();

    if (language === 'ru') {
        return (
            <div className="add-product__section add-product__section--translations">
                <h2 className="add-product__section-title">Контент (RU)</h2>
                <div className="add-product__fields-grid">
                    <div>
                        <label className="block text-sm font-medium mb-1">Название *</label>
                        <Input placeholder="Название товара" {...register('title')} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Назначение / краткое описание</label>
                        <Textarea placeholder="Для чего товар, кратко" {...register('purpose')} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Полное описание</label>
                        <Textarea placeholder="Полное описание товара" {...register('description')} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Состав (INCI)</label>
                        <p className="text-xs text-gray-500 mb-1">
                            Один на все языки — таб «Состав» на странице товара; пустое поле = таб скрыт
                        </p>
                        <Textarea
                            placeholder="Aqua;Glycerin;Parfum;..."
                            {...register('ingredients')}
                        />
                    </div>
                </div>

                <h3 className="add-product__section-subtitle mt-4">Характеристики-карточки (feature1–4)</h3>
                <p className="text-xs text-gray-500 mb-2">Отображаются в блоке преимуществ на странице товара</p>
                <div className="add-product__fields-grid">
                    <div>
                        <label className="block text-sm font-medium mb-1">Feature 1</label>
                        <Input placeholder="Например: Натуральный состав" {...register('feature1')} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Feature 2</label>
                        <Input placeholder="Например: Без парабенов" {...register('feature2')} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Feature 3</label>
                        <Input placeholder="Например: Дерматологически протестировано" {...register('feature3')} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Feature 4</label>
                        <Input placeholder="Например: Подходит всем типам кожи" {...register('feature4')} />
                    </div>
                </div>

                <h3 className="add-product__section-subtitle mt-4">Краткие характеристики (spec)</h3>
                <p className="text-xs text-gray-500 mb-2">Объём, тип и страна — отображаются в блоке spec на странице товара</p>
                <div className="add-product__fields-grid">
                    <div>
                        <label className="block text-sm font-medium mb-1">Объём</label>
                        <Input placeholder="Например: 250 мл" {...register('specVolume')} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Тип</label>
                        <Input placeholder="Например: Профессиональный" {...register('specType')} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Страна</label>
                        <Input placeholder="Например: Германия" {...register('specCountry')} />
                    </div>
                </div>
            </div>
        );
    }

    if (language === 'en') {
        return (
            <div className="add-product__section add-product__section--translations">
                <h2 className="add-product__section-title">Content (EN)</h2>
                <div className="add-product__fields-grid">
                    <div>
                        <label className="block text-sm font-medium mb-1">Title</label>
                        <Input placeholder="Product title" {...register('titleEn')} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Purpose / short description</label>
                        <Textarea placeholder="What the product is for" {...register('purposeEn')} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Full description</label>
                        <Textarea placeholder="Full product description" {...register('descriptionEn')} />
                    </div>
                </div>

                <h3 className="add-product__section-subtitle mt-4">Feature cards (EN)</h3>
                <div className="add-product__fields-grid">
                    <div>
                        <label className="block text-sm font-medium mb-1">Feature 1 (EN)</label>
                        <Input placeholder="e.g. Natural components" {...register('feature1En')} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Feature 2 (EN)</label>
                        <Input placeholder="e.g. Paraben-free" {...register('feature2En')} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Feature 3 (EN)</label>
                        <Input placeholder="e.g. Dermatologically tested" {...register('feature3En')} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Feature 4 (EN)</label>
                        <Input placeholder="e.g. Suitable for all skin types" {...register('feature4En')} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="add-product__section add-product__section--translations">
            <h2 className="add-product__section-title">Saturs (LV)</h2>
            <div className="add-product__fields-grid">
                <div>
                    <label className="block text-sm font-medium mb-1">Nosaukums</label>
                    <Input placeholder="Produkta nosaukums" {...register('titleLv')} />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Mērķis / īss apraksts</label>
                    <Textarea placeholder="Kam produkts paredzēts" {...register('purposeLv')} />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Pilns apraksts</label>
                    <Textarea placeholder="Pilns produkta apraksts" {...register('descriptionLv')} />
                </div>
            </div>

            <h3 className="add-product__section-subtitle mt-4">Iezīmju kartiņas (LV)</h3>
            <div className="add-product__fields-grid">
                <div>
                    <label className="block text-sm font-medium mb-1">Feature 1 (LV)</label>
                    <Input placeholder="piem. Dabiskas sastāvdaļas" {...register('feature1Lv')} />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Feature 2 (LV)</label>
                    <Input placeholder="piem. Bez parabēniem" {...register('feature2Lv')} />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Feature 3 (LV)</label>
                    <Input placeholder="piem. Dermatoloģiski pārbaudīts" {...register('feature3Lv')} />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Feature 4 (LV)</label>
                    <Input placeholder="piem. Piemērots visiem ādas tipiem" {...register('feature4Lv')} />
                </div>
            </div>
        </div>
    );
};

export default ProductTranslationsFields;
