'use client';

import React, { useEffect, useState } from 'react';
import { useForm, useWatch, FormProvider, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { addProductSchema, AddProductFormValues, LANGUAGES, Language } from './productFormSchema';
import { useTranslation } from '@/lib/use-translation';
import { mapFormValuesToNewProduct, mapFormValuesToProductPatch } from '@/lib/product-form-mapping';

import ProductBasicFields from './ProductBasicFields';
import ProductBadgesFields from './ProductBadgesFields';
import ProductPricingFields from './ProductPricingFields';
import ProductInventoryFields from './ProductInventoryFields';
import ProductSeoFields from './ProductSeoFields';
import ProductTranslationsFields from './ProductTranslationsFields';
import ProductGalleryFields from './ProductGalleryFields';
import ProductTechSpecsFields from './ProductTechSpecsFields';
import ProductVariantGroupsFields from './ProductVariantGroupsFields';
import ProductCertificatesFields from './ProductCertificatesFields';
import ProductBulkPricingFields from './ProductBulkPricingFields';
import ProductPicker from './ProductPicker';
import ProductManufacturerFields from './ProductManufacturerFields';
import ProductPreviewCard from './ProductPreviewCard';
import { ProductFormModeContext } from './ProductFormModeContext';
import { NotifyPromoSubscribersButton } from './NotifyPromoSubscribersButton';

import './AddProductForm.css';

// Контекст режима формы — используется в дочерних компонентах (напр., ProductBasicFields)
const emptyDefaults: AddProductFormValues = {
    id: '',
    sku: '',
    barcode: '',
    brand: '',
    category: '',
    status: 'active',

    title: '',
    titleEn: '',
    titleLv: '',

    description: '',
    descriptionEn: '',
    descriptionLv: '',
    ingredients: '',
    ingredientsKey: 'INGREDIENTS',
    application: '',
    applicationEn: '',
    applicationLv: '',
    warnings: '',
    warningsEn: '',
    warningsLv: '',

    price: 0,
    oldPrice: 0,
    bulkPricingTiers: [],

    stock: 0,
    minOrder: 1,

    image: '',
    images: [],

    badges: [],
    technicalSpecs: [],
    reservedTechSpecs: {},
    variantGroups: [],
    compatibleEquipment: [],
    certificates: [],
    relatedProductIds: [],
    oftenBoughtTogether: [],
    demoVideo: [],

    metaTitle: '',
    metaDescription: '',
    ogImage: '',
    ogAlt: '',

    manufacturerName: '',
    manufacturerAddress: '',
    manufacturerEmail: '',
    distributorName: { ru: '', en: '', lv: '' },
    distributorAddress: { ru: '', en: '', lv: '' },
    distributorEmail: '',

    bonusRate: undefined,
    rating: undefined,

    feature1: '',
    feature1En: '',
    feature1Lv: '',
    feature2: '',
    feature2En: '',
    feature2Lv: '',
    feature3: '',
    feature3En: '',
    feature3Lv: '',
    feature4: '',
    feature4En: '',
    feature4Lv: '',
};

interface AddProductFormProps {
    mode?: 'add' | 'edit';
    productId?: string;
    initialValues?: AddProductFormValues;
    revision?: number;
}

const AddProductForm: React.FC<AddProductFormProps> = ({
    mode = 'add',
    productId,
    initialValues,
    revision,
}) => {
    const router = useRouter();
    const [language, setLanguage] = useState<Language>('ru');
    const [submitError, setSubmitError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { t } = useTranslation();
    const isEdit = mode === 'edit';

    const methods = useForm<AddProductFormValues>({
        resolver: zodResolver(addProductSchema),
        defaultValues: initialValues ?? emptyDefaults,
        mode: 'onChange',
    });

    const { handleSubmit, formState, trigger } = methods;

    // react-hook-form + zodResolver + mode:'onChange' only computes formState.isValid
    // after the first validation pass, which normally fires on the user's first onChange —
    // it does NOT run automatically on mount. Without this, the Save button stays disabled
    // forever even when defaultValues are already fully valid (formState.errors stays empty
    // too, so there's no visible field error to explain it).
    useEffect(() => {
        void trigger();
    }, [trigger]);

    const [image, title, titleEn, titleLv, brand, price, oldPrice, badges, stock, sku] = useWatch({
        control: methods.control,
        name: ['image', 'title', 'titleEn', 'titleLv', 'brand', 'price', 'oldPrice', 'badges', 'stock', 'sku'],
    });

    const localizedTitle = language === 'en' ? titleEn : language === 'lv' ? titleLv : title;

    const onSubmit: SubmitHandler<AddProductFormValues> = async (data) => {
        setSubmitError('');
        setIsSubmitting(true);
        try {
            if (isEdit && productId) {
                const res = await fetch('/api/admin/products', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: productId, revision, changes: mapFormValuesToProductPatch(data) }),
                });
                if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    throw new Error(json?.error ?? 'Ошибка сохранения');
                }
            } else {
                const res = await fetch('/api/admin/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ product: mapFormValuesToNewProduct(data) }),
                });
                if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    throw new Error(json?.error ?? 'Ошибка создания товара');
                }
            }
            router.push('/admin/products');
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Неизвестная ошибка');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ProductFormModeContext.Provider value={{ isEdit }}>
            <FormProvider {...methods}>
                <form
                    className="add-product add-product__layout"
                    onSubmit={handleSubmit(onSubmit)}
                    autoComplete="off"
                >
                    <div className="add-product__form flex flex-col">
                        <div className="add-product__body">
                            <Tabs
                                value={language}
                                onValueChange={(value) => setLanguage(value as Language)}
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
                            <ProductTranslationsFields language={language} />
                            <ProductBasicFields />
                            <ProductPricingFields />
                            <ProductInventoryFields />
                            <ProductGalleryFields productId={isEdit ? productId : undefined} />
                            <div className="add-product__options-row">
                                <ProductTechSpecsFields />
                                <ProductVariantGroupsFields />
                                <ProductCertificatesFields />
                                <ProductBulkPricingFields />
                            </div>
                            <ProductPicker
                                name="relatedProductIds"
                                title="Похожие товары"
                                hint="Показываются в блоке «Похожие товары». Если список пуст — блок заполняется автоматически товарами того же бренда и категории."
                            />
                            <ProductPicker
                                name="oftenBoughtTogether"
                                title="Часто покупают вместе"
                                hint="Показываются в блоке «Часто покупают вместе». Если список пуст — блок заполняется автоматически по статистике реальных заказов."
                            />
                            <ProductManufacturerFields language={language} />
                            <ProductSeoFields />
                        </div>
                        <div className="add-product__actions flex flex-col gap-2">
                            <div className="flex gap-4">
                                <Button type="submit" disabled={!formState.isValid || isSubmitting}>
                                    {isSubmitting
                                        ? 'Сохраняю...'
                                        : isEdit
                                        ? t('admin.editProduct.save', 'Сохранить изменения')
                                        : t('admin.addProduct.save', 'Сохранить товар')}
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => router.push('/admin/products')}
                                >
                                    {t('admin.addProduct.cancel', 'Отмена')}
                                </Button>
                                {isEdit && productId && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            window.open(`/product/${productId}`, '_blank')
                                        }
                                    >
                                        Открыть на сайте ↗
                                    </Button>
                                )}
                                {isEdit && productId && <NotifyPromoSubscribersButton productId={productId} />}
                            </div>
                            {submitError && (
                                <p className="text-red-600 text-sm">{submitError}</p>
                            )}
                        </div>
                    </div>
                    <aside className="add-product__preview sticky top-4 self-start">
                        <ProductPreviewCard
                            image={image}
                            title={localizedTitle || ''}
                            brand={brand}
                            price={price}
                            oldPrice={oldPrice}
                            badges={badges}
                            stock={stock}
                            sku={sku}
                        />
                        <div className="mt-4">
                            <ProductBadgesFields />
                        </div>
                    </aside>
                </form>
            </FormProvider>
        </ProductFormModeContext.Provider>
    );
};

export default AddProductForm;
