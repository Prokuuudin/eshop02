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
                        <label htmlFor="product-translation-title" className="block text-sm font-medium mb-1">Название *</label>
                        <Input id="product-translation-title" placeholder="Название товара" {...register('title')} />
                    </div>
                    <div>
                        <label htmlFor="product-translation-description" className="block text-sm font-medium mb-1">Описание</label>
                        <Textarea id="product-translation-description" placeholder="Описание товара" {...register('description')} />
                    </div>
                    <div>
                        <label htmlFor="product-translation-ingredients" className="block text-sm font-medium mb-1">Состав (INCI)</label>
                        <p className="text-xs text-muted-foreground mb-1">
                            Один на все языки — таб «Состав» на странице товара; пустое поле = таб скрыт
                        </p>
                        <Textarea id="product-translation-ingredients"
                            placeholder="Aqua;Glycerin;Parfum;..."
                            {...register('ingredients')}
                        />
                    </div>
                    <div>
                        <label htmlFor="product-translation-application" className="block text-sm font-medium mb-1">Применение</label>
                        <p className="text-xs text-muted-foreground mb-1">
                            Таб «Применение» на странице товара; пустое поле = таб скрыт
                        </p>
                        <Textarea id="product-translation-application"
                            placeholder="Как использовать товар"
                            {...register('application')}
                        />
                    </div>
                    <div>
                        <label htmlFor="product-translation-warnings" className="block text-sm font-medium mb-1">Предостережения</label>
                        <p className="text-xs text-muted-foreground mb-1">
                            Таб «Предостережения» на странице товара; пустое поле = таб скрыт
                        </p>
                        <Textarea id="product-translation-warnings"
                            placeholder="Меры предосторожности, противопоказания"
                            {...register('warnings')}
                        />
                    </div>
                </div>

                <h3 className="add-product__section-title mt-4">Дополнительные характеристики (1–4)</h3>
                <div className="add-product__fields-grid">
                    <div>
                        <label htmlFor="product-translation-feature1" className="block text-sm font-medium mb-1">Feature 1</label>
                        <Input id="product-translation-feature1" placeholder="Например: Натуральный состав" {...register('feature1')} />
                    </div>
                    <div>
                        <label htmlFor="product-translation-feature2" className="block text-sm font-medium mb-1">Feature 2</label>
                        <Input id="product-translation-feature2" placeholder="Например: Без парабенов" {...register('feature2')} />
                    </div>
                    <div>
                        <label htmlFor="product-translation-feature3" className="block text-sm font-medium mb-1">Feature 3</label>
                        <Input id="product-translation-feature3" placeholder="Например: Дерматологически протестировано" {...register('feature3')} />
                    </div>
                    <div>
                        <label htmlFor="product-translation-feature4" className="block text-sm font-medium mb-1">Feature 4</label>
                        <Input id="product-translation-feature4" placeholder="Например: Подходит всем типам кожи" {...register('feature4')} />
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
                        <label htmlFor="product-translation-titleEn" className="block text-sm font-medium mb-1">Title</label>
                        <Input id="product-translation-titleEn" placeholder="Product title" {...register('titleEn')} />
                    </div>
                    <div>
                        <label htmlFor="product-translation-descriptionEn" className="block text-sm font-medium mb-1">Description</label>
                        <Textarea id="product-translation-descriptionEn" placeholder="Product description" {...register('descriptionEn')} />
                    </div>
                    <div>
                        <label htmlFor="product-translation-applicationEn" className="block text-sm font-medium mb-1">Application (EN)</label>
                        <Textarea id="product-translation-applicationEn" placeholder="How to use the product" {...register('applicationEn')} />
                    </div>
                    <div>
                        <label htmlFor="product-translation-warningsEn" className="block text-sm font-medium mb-1">Warnings (EN)</label>
                        <Textarea id="product-translation-warningsEn" placeholder="Precautions, contraindications" {...register('warningsEn')} />
                    </div>
                </div>

                <h3 className="add-product__section-subtitle mt-4">Feature cards (EN)</h3>
                <div className="add-product__fields-grid">
                    <div>
                        <label htmlFor="product-translation-feature1En" className="block text-sm font-medium mb-1">Feature 1 (EN)</label>
                        <Input id="product-translation-feature1En" placeholder="e.g. Natural components" {...register('feature1En')} />
                    </div>
                    <div>
                        <label htmlFor="product-translation-feature2En" className="block text-sm font-medium mb-1">Feature 2 (EN)</label>
                        <Input id="product-translation-feature2En" placeholder="e.g. Paraben-free" {...register('feature2En')} />
                    </div>
                    <div>
                        <label htmlFor="product-translation-feature3En" className="block text-sm font-medium mb-1">Feature 3 (EN)</label>
                        <Input id="product-translation-feature3En" placeholder="e.g. Dermatologically tested" {...register('feature3En')} />
                    </div>
                    <div>
                        <label htmlFor="product-translation-feature4En" className="block text-sm font-medium mb-1">Feature 4 (EN)</label>
                        <Input id="product-translation-feature4En" placeholder="e.g. Suitable for all skin types" {...register('feature4En')} />
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
                    <label htmlFor="product-translation-titleLv" className="block text-sm font-medium mb-1">Nosaukums</label>
                    <Input id="product-translation-titleLv" placeholder="Produkta nosaukums" {...register('titleLv')} />
                </div>
                <div>
                    <label htmlFor="product-translation-descriptionLv" className="block text-sm font-medium mb-1">Apraksts</label>
                    <Textarea id="product-translation-descriptionLv" placeholder="Produkta apraksts" {...register('descriptionLv')} />
                </div>
                <div>
                    <label htmlFor="product-translation-applicationLv" className="block text-sm font-medium mb-1">Pielietojums (LV)</label>
                    <Textarea id="product-translation-applicationLv" placeholder="Kā lietot produktu" {...register('applicationLv')} />
                </div>
                <div>
                    <label htmlFor="product-translation-warningsLv" className="block text-sm font-medium mb-1">Brīdinājumi (LV)</label>
                    <Textarea id="product-translation-warningsLv" placeholder="Piesardzības pasākumi" {...register('warningsLv')} />
                </div>
            </div>

            <h3 className="add-product__section-subtitle mt-4">Iezīmju kartiņas (LV)</h3>
            <div className="add-product__fields-grid">
                <div>
                    <label htmlFor="product-translation-feature1Lv" className="block text-sm font-medium mb-1">Feature 1 (LV)</label>
                    <Input id="product-translation-feature1Lv" placeholder="piem. Dabiskas sastāvdaļas" {...register('feature1Lv')} />
                </div>
                <div>
                    <label htmlFor="product-translation-feature2Lv" className="block text-sm font-medium mb-1">Feature 2 (LV)</label>
                    <Input id="product-translation-feature2Lv" placeholder="piem. Bez parabēniem" {...register('feature2Lv')} />
                </div>
                <div>
                    <label htmlFor="product-translation-feature3Lv" className="block text-sm font-medium mb-1">Feature 3 (LV)</label>
                    <Input id="product-translation-feature3Lv" placeholder="piem. Dermatoloģiski pārbaudīts" {...register('feature3Lv')} />
                </div>
                <div>
                    <label htmlFor="product-translation-feature4Lv" className="block text-sm font-medium mb-1">Feature 4 (LV)</label>
                    <Input id="product-translation-feature4Lv" placeholder="piem. Piemērots visiem ādas tipiem" {...register('feature4Lv')} />
                </div>
            </div>
        </div>
    );
};

export default ProductTranslationsFields;
