'use client';

import React, { useState } from 'react';
import { useForm, FormProvider, SubmitHandler, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { addProductSchema, AddProductFormValues, LANGUAGES, Language } from './productFormSchema';
import ProductBasicFields from './ProductBasicFields';
import ProductBadgesFields from './ProductBadgesFields';
import ProductPricingFields from './ProductPricingFields';
import ProductInventoryFields from './ProductInventoryFields';
import ProductSeoFields from './ProductSeoFields';
import ProductTranslationsFields from './ProductTranslationsFields';

import ProductGalleryFields from './ProductGalleryFields';
import ProductTechSpecsFields from './ProductTechSpecsFields';
import ProductCertificatesFields from './ProductCertificatesFields';
import ProductBulkPricingFields from './ProductBulkPricingFields';
import ProductRelatedFields from './ProductRelatedFields';
import ProductBoughtTogetherFields from './ProductBoughtTogetherFields';
import ProductPreviewCard from './ProductPreviewCard';

import './AddProductForm.css';

const defaultValues: AddProductFormValues = {
    id: '',
    sku: '',
    barcode: '',
    brand: '',
    category: '',
    type: '',
    status: 'active',
    titles: { ru: '', en: '', lv: '' },
    shortDescriptions: { ru: '', en: '', lv: '' },
    fullDescriptions: { ru: '', en: '', lv: '' },
    price: 0,
    oldPrice: 0,
    currency: 'EUR',
    vatIncluded: true,
    bulkPricing: [],
    stock: 0,
    minOrder: 1,
    unit: 'pcs',
    mainImage: '',
    gallery: [],
    previewImage: '',
    labels: [],
    volume: '',
    size: '',
    country: '',
    material: '',
    compatibility: '',
    certificates: [],
    metaTitles: { ru: '', en: '', lv: '' },
    metaDescriptions: { ru: '', en: '', lv: '' },
    slug: '',
    relatedProducts: [],
    boughtTogether: [],
};

const AddProductForm: React.FC = () => {
    const [language, setLanguage] = useState<Language>('ru');
    const methods = useForm<AddProductFormValues>({
        resolver: zodResolver(addProductSchema),
        defaultValues,
        mode: 'onChange',
    });

    const { handleSubmit, formState, control } = methods;
    const formValues = useWatch({ control });

    const onSubmit: SubmitHandler<AddProductFormValues> = (data) => {
        // TODO: Submit to backend
        alert('Product submitted: ' + JSON.stringify(data, null, 2));
    };

    return (
        <FormProvider {...methods}>
            <form
                className="add-product add-product__layout grid grid-cols-1 md:grid-cols-2 gap-8"
                onSubmit={handleSubmit(onSubmit)}
                autoComplete="off"
            >
                <div className="add-product__form flex flex-col gap-6">
                    <div className="add-product__section">
                        <Tabs
                            value={language}
                            onValueChange={(value) => setLanguage(value as 'ru' | 'en' | 'lv')}
                        >
                            <TabsList>
                                {LANGUAGES.map((lang) => (
                                    <TabsTrigger
                                        key={lang}
                                        value={lang}
                                        className="add-product__lang-tab"
                                    >
                                        {lang.toUpperCase()}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                        <Separator />
                        <ProductBasicFields />
                        <ProductPricingFields />
                        <ProductInventoryFields />
                        <ProductGalleryFields />
                        <ProductTechSpecsFields />
                        <ProductCertificatesFields />
                        <ProductBulkPricingFields />
                        <ProductRelatedFields />
                        <ProductBoughtTogetherFields />
                        <ProductSeoFields language={language} />
                    </div>
                    <div className="add-product__actions flex gap-4 mt-4">
                        <Button type="submit" disabled={!formState.isValid}>
                            Сохранить товар
                        </Button>
                        <Button type="button" variant="secondary">
                            Отмена
                        </Button>
                    </div>
                </div>
                <aside className="add-product__preview sticky top-4 self-start">
                    <ProductPreviewCard
                        values={{
                            ...formValues,
                            titles: {
                                ru: formValues.titles?.ru || '',
                                en: formValues.titles?.en || '',
                                lv: formValues.titles?.lv || '',
                            },
                            shortDescriptions: {
                                ru: formValues.shortDescriptions?.ru || '',
                                en: formValues.shortDescriptions?.en || '',
                                lv: formValues.shortDescriptions?.lv || '',
                            },
                            fullDescriptions: {
                                ru: formValues.fullDescriptions?.ru || '',
                                en: formValues.fullDescriptions?.en || '',
                                lv: formValues.fullDescriptions?.lv || '',
                            },
                            bulkPricing: (formValues.bulkPricing ?? []).map((bp) => ({
                                minQty: bp.minQty ?? 1,
                                price: bp.price ?? 0,
                            })),
                            metaTitles: {
                                ru: formValues.metaTitles?.ru || '',
                                en: formValues.metaTitles?.en || '',
                                lv: formValues.metaTitles?.lv || '',
                            },
                            metaDescriptions: {
                                ru: formValues.metaDescriptions?.ru || '',
                                en: formValues.metaDescriptions?.en || '',
                                lv: formValues.metaDescriptions?.lv || '',
                            },
                        }}
                        language={language}
                    />
                    <div className="mt-4">
                        <ProductBadgesFields />
                    </div>
                </aside>
            </form>
        </FormProvider>
    );
};

export default AddProductForm;
