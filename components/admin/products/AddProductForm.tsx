'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch, FormProvider, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { createAddProductSchema, AddProductFormValues, LANGUAGES, Language } from './productFormSchema';
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
import ProductSeoIssuePanel, { type SeoEditContext } from './ProductSeoIssuePanel';
import { ProductFormModeContext } from './ProductFormModeContext';
import { NotifyPromoSubscribersButton } from './NotifyPromoSubscribersButton';
import { AlertCircle, ChevronDown, RotateCcw } from 'lucide-react';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider';

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

    stock: 1,
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
    seoContext?: SeoEditContext;
}

const ProductFormAccordionSection: React.FC<{
    id?: string;
    title: React.ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
}> = ({ id, title, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = React.useState(defaultOpen);

    return (
        <details
            id={id}
            className="add-product__accordion-section group"
            open={isOpen}
            onToggle={(event) => setIsOpen(event.currentTarget.open)}
        >
            <summary className="add-product__accordion-trigger">
                <span className="add-product__accordion-title">{title}</span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="add-product__accordion-content">{children}</div>
        </details>
    );
};

const AddProductForm: React.FC<AddProductFormProps> = ({
    mode = 'add',
    productId,
    initialValues,
    revision,
    seoContext,
}) => {
    const router = useRouter();
    const confirmAction = useAdminConfirm();
    const [language, setLanguage] = useState<Language>('ru');
    const [submitError, setSubmitError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [previewTop, setPreviewTop] = useState(166);
    const { t } = useTranslation();
    const { l } = useAdminLocale();
    const isEdit = mode === 'edit';
    const addProductSchema = useMemo(() => createAddProductSchema(l), [l]);

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

    useEffect(() => {
        const header = document.querySelector('header.header');
        if (!(header instanceof HTMLElement)) return;
        const updatePreviewTop = () => setPreviewTop(Math.ceil(header.getBoundingClientRect().bottom) + 16);
        updatePreviewTop();
        const observer = new ResizeObserver(updatePreviewTop);
        observer.observe(header);
        window.addEventListener('resize', updatePreviewTop);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updatePreviewTop);
        };
    }, []);

    const [image, title, titleEn, titleLv, brand, price, oldPrice, badges, stock, rating, bulkPricingTiers] = useWatch({
        control: methods.control,
        name: ['image', 'title', 'titleEn', 'titleLv', 'brand', 'price', 'oldPrice', 'badges', 'stock', 'rating', 'bulkPricingTiers'],
    });

    const localizedTitle = language === 'en' ? titleEn : language === 'lv' ? titleLv : title;

    const restorePreviousVersion = async () => {
        if (!productId || !revision) return;
        const decision = await confirmAction({
            title: l('Вернуть предыдущую версию товара?', 'Restore the previous product version?', 'Atjaunot preces iepriekšējo versiju?'),
            description: l('Последнее сохранение будет отменено. Текущее состояние останется в истории, поэтому откат тоже можно будет отменить.', 'The latest save will be undone. The current state remains in history, so this restore can also be undone.', 'Pēdējā saglabāšana tiks atsaukta. Pašreizējais stāvoklis paliks vēsturē, tāpēc arī šo atjaunošanu varēs atsaukt.'),
            affected: [localizedTitle || productId],
            destructive: true,
            confirmLabel: l('Вернуть версию', 'Restore version', 'Atjaunot versiju'),
        });
        if (!decision.confirmed) return;
        setIsRestoring(true);
        setSubmitError('');
        try {
            const response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/restore-previous`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ revision }),
            });
            const result = await response.json().catch(() => ({})) as { error?: string };
            if (!response.ok) throw new Error(result.error || l('Не удалось восстановить версию', 'Failed to restore version', 'Neizdevās atjaunot versiju'));
            window.location.reload();
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : l('Не удалось восстановить версию', 'Failed to restore version', 'Neizdevās atjaunot versiju'));
            setIsRestoring(false);
        }
    };

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
                    const json = await res.json().catch(() => ({})) as { error?: string };
                    throw new Error(json.error === 'SKU already belongs to another product'
                        ? l('Этот SKU уже используется другим товаром', 'This SKU is already used by another product', 'Šo SKU jau izmanto cita prece')
                        : json.error ?? l('Ошибка сохранения', 'Failed to save', 'Saglabāšanas kļūda'));
                }
            } else {
                const res = await fetch('/api/admin/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ product: mapFormValuesToNewProduct(data) }),
                });
                if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    throw new Error(json?.error ?? l('Ошибка создания товара', 'Failed to create product', 'Preces izveides kļūda'));
                }
            }
            router.push(seoContext?.returnTo ?? '/admin/products');
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : l('Неизвестная ошибка', 'Unknown error', 'Nezināma kļūda'));
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
                            {seoContext && <ProductSeoIssuePanel context={seoContext} onSelectLanguage={setLanguage} />}
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
                            <ProductFormAccordionSection
                                id="product-form-content-section"
                                title={language === 'ru' ? 'Контент (RU)' : language === 'en' ? 'Content (EN)' : 'Saturs (LV)'}
                            >
                                <ProductTranslationsFields language={language} />
                            </ProductFormAccordionSection>
                            <ProductFormAccordionSection title={l('Основная информация', 'Basic information', 'Pamatinformācija')}>
                                <ProductBasicFields />
                            </ProductFormAccordionSection>
                            <ProductFormAccordionSection title={l('Цена', 'Price', 'Cena')}>
                                <ProductPricingFields />
                            </ProductFormAccordionSection>
                            <ProductFormAccordionSection title={l('Склад и наличие', 'Inventory and availability', 'Noliktava un pieejamība')}>
                                <ProductInventoryFields />
                            </ProductFormAccordionSection>
                            <ProductFormAccordionSection id="product-form-images-section" title={l('Изображения', 'Images', 'Attēli')}>
                                <ProductGalleryFields productId={isEdit ? productId : undefined} />
                            </ProductFormAccordionSection>
                            <div className="add-product__options-row">
                                <ProductFormAccordionSection title={l('Совместимое оборудование', 'Compatible equipment', 'Saderīgs aprīkojums')}>
                                    <ProductTechSpecsFields />
                                </ProductFormAccordionSection>
                                <ProductFormAccordionSection title={l('Варианты (цвет / комплектация)', 'Variants (color / configuration)', 'Varianti (krāsa / komplektācija)')}>
                                    <ProductVariantGroupsFields />
                                </ProductFormAccordionSection>
                                <ProductFormAccordionSection title={l('Сертификаты', 'Certificates', 'Sertifikāti')}>
                                    <ProductCertificatesFields />
                                </ProductFormAccordionSection>
                                <ProductFormAccordionSection title={l('Оптовое ценообразование', 'Wholesale pricing', 'Vairumtirdzniecības cenas')}>
                                    <ProductBulkPricingFields />
                                </ProductFormAccordionSection>
                            </div>
                            <ProductFormAccordionSection title={l('Похожие товары', 'Related products', 'Saistītās preces')}>
                                <ProductPicker
                                    name="relatedProductIds"
                                    title={l('Похожие товары', 'Related products', 'Saistītās preces')}
                                    hint={l('Показываются в блоке «Похожие товары». Если список пуст — блок заполняется автоматически товарами того же бренда и категории.', 'Shown in the Related products section. If empty, products from the same brand and category are selected automatically.', 'Tiek rādītas sadaļā Saistītās preces. Ja saraksts ir tukšs, automātiski tiek atlasītas tā paša zīmola un kategorijas preces.')}
                                />
                            </ProductFormAccordionSection>
                            <ProductFormAccordionSection title={l('Часто покупают вместе', 'Frequently bought together', 'Bieži pērk kopā')}>
                                <ProductPicker
                                    name="oftenBoughtTogether"
                                    title={l('Часто покупают вместе', 'Frequently bought together', 'Bieži pērk kopā')}
                                    hint={l('Показываются в блоке «Часто покупают вместе». Если список пуст — блок заполняется автоматически по статистике реальных заказов.', 'Shown in the Frequently bought together section. If empty, the list is generated from actual order statistics.', 'Tiek rādītas sadaļā Bieži pērk kopā. Ja saraksts ir tukšs, tas tiek izveidots no reālo pasūtījumu statistikas.')}
                                />
                            </ProductFormAccordionSection>
                            <ProductFormAccordionSection
                                title={
                                    <>
                                        {l('Производитель и дистрибьютор', 'Manufacturer and distributor', 'Ražotājs un izplatītājs')}{' '}
                                        <span className="text-destructive">{l('(обязательно)', '(required)', '(obligāti)')}</span>
                                    </>
                                }
                            >
                                <ProductManufacturerFields language={language} />
                            </ProductFormAccordionSection>
                            <ProductFormAccordionSection id="product-form-seo-section" title="SEO">
                                <ProductSeoFields />
                            </ProductFormAccordionSection>
                        </div>
                        <div className="add-product__actions flex flex-col gap-2">
                            <div className="flex flex-wrap gap-4">
                                <Button type="submit" disabled={!formState.isValid || isSubmitting}>
                                    {isSubmitting
                                        ? l('Сохраняю...', 'Saving...', 'Saglabā...')
                                        : isEdit
                                        ? t('admin.editProduct.save', l('Сохранить изменения', 'Save changes', 'Saglabāt izmaiņas'))
                                        : t('admin.addProduct.save', l('Сохранить товар', 'Save product', 'Saglabāt preci'))}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => router.push(seoContext?.returnTo ?? '/admin/products')}
                                >
                                    {t('admin.addProduct.cancel', l('Отмена', 'Cancel', 'Atcelt'))}
                                </Button>
                                {isEdit && productId && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            window.open(`/product/${productId}`, '_blank')
                                        }
                                    >
                                        {l('Открыть на сайте', 'Open on website', 'Atvērt vietnē')} ↗
                                    </Button>
                                )}
                                {isEdit && productId && <NotifyPromoSubscribersButton productId={productId} />}
                                {isEdit && productId && (
                                    <Button type="button" variant="outline" disabled={isSubmitting || isRestoring} onClick={() => void restorePreviousVersion()}>
                                        <RotateCcw className="mr-2 h-4 w-4" />
                                        {isRestoring ? l('Восстанавливаю…', 'Restoring…', 'Atjauno…') : l('Вернуть предыдущую версию', 'Restore previous version', 'Atjaunot iepriekšējo versiju')}
                                    </Button>
                                )}
                            </div>
                            {submitError && (
                                <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900 shadow-sm dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                                    <div>
                                        <p className="text-sm font-semibold">{l('Не удалось сохранить товар', 'Could not save product', 'Neizdevās saglabāt preci')}</p>
                                        <p className="mt-0.5 text-sm leading-relaxed">{submitError}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <aside className="add-product__preview" style={{ top: previewTop }}>
                        <ProductPreviewCard
                            image={image}
                            title={localizedTitle || ''}
                            brand={brand}
                            price={price}
                            oldPrice={oldPrice}
                            badges={badges}
                            stock={stock}
                            rating={rating}
                            bulkPricingTiers={bulkPricingTiers}
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
