'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useAdminLocale } from '@/lib/use-admin-locale';
import type { AddProductFormValues, Language } from './productFormSchema';

export type SeoEditContext = {
    returnTo: string;
    duplicateMetaTitle: boolean;
    duplicateMetaDescription: boolean;
    initialMetaTitle: string;
    initialMetaDescription: string;
};

type SeoIssue = {
    key: string;
    label: string;
    targetId: string;
    sectionId: string;
    language?: Language;
};

const normalizeMeta = (value: string | undefined): string => value?.trim().toLowerCase() ?? '';

export default function ProductSeoIssuePanel({
    context,
    onSelectLanguage,
}: {
    context: SeoEditContext;
    onSelectLanguage: (language: Language) => void;
}): React.ReactElement {
    const { l } = useAdminLocale();
    const { control } = useFormContext<AddProductFormValues>();
    const [metaTitle, metaDescription, image, images, ogAlt, titleEn, titleLv] = useWatch({
        control,
        name: ['metaTitle', 'metaDescription', 'image', 'images', 'ogAlt', 'titleEn', 'titleLv'],
    });
    const cleanMetaTitle = metaTitle?.trim() ?? '';
    const cleanMetaDescription = metaDescription?.trim() ?? '';
    const hasImage = Boolean(image?.trim() || images?.some((item) => item.trim()));
    const issues: SeoIssue[] = [];

    if (cleanMetaTitle.length < 10 || cleanMetaTitle.length > 60) {
        issues.push({
            key: 'metaTitle',
            label: cleanMetaTitle
                ? l(`metaTitle: ${cleanMetaTitle.length} символов, требуется 10–60`, `metaTitle: ${cleanMetaTitle.length} characters, 10–60 required`, `metaTitle: ${cleanMetaTitle.length} rakstzīmes, nepieciešamas 10–60`)
                : l('metaTitle отсутствует', 'metaTitle is missing', 'metaTitle nav norādīts'),
            targetId: 'product-meta-title',
            sectionId: 'product-form-seo-section',
        });
    }
    if (cleanMetaDescription.length < 50 || cleanMetaDescription.length > 160) {
        issues.push({
            key: 'metaDescription',
            label: cleanMetaDescription
                ? l(`metaDescription: ${cleanMetaDescription.length} символов, требуется 50–160`, `metaDescription: ${cleanMetaDescription.length} characters, 50–160 required`, `metaDescription: ${cleanMetaDescription.length} rakstzīmes, nepieciešamas 50–160`)
                : l('metaDescription отсутствует', 'metaDescription is missing', 'metaDescription nav norādīts'),
            targetId: 'product-meta-description',
            sectionId: 'product-form-seo-section',
        });
    }
    if (!hasImage) {
        issues.push({ key: 'image', label: l('Нет изображения товара', 'Product image is missing', 'Trūkst preces attēla'), targetId: 'add-product-image', sectionId: 'product-form-images-section' });
    } else if (!ogAlt?.trim()) {
        issues.push({ key: 'ogAlt', label: l('Нет описания изображения для превью ссылки (Alt)', 'Link preview image description (Alt) is missing', 'Trūkst saites priekšskatījuma attēla apraksta (Alt)'), targetId: 'product-og-alt', sectionId: 'product-form-seo-section' });
    }
    if (!titleEn?.trim()) {
        issues.push({ key: 'titleEn', label: l('Нет названия товара на английском', 'English product title is missing', 'Trūkst preces nosaukuma angļu valodā'), targetId: 'product-translation-titleEn', sectionId: 'product-form-content-section', language: 'en' });
    }
    if (!titleLv?.trim()) {
        issues.push({ key: 'titleLv', label: l('Нет названия товара на латышском', 'Latvian product title is missing', 'Trūkst preces nosaukuma latviešu valodā'), targetId: 'product-translation-titleLv', sectionId: 'product-form-content-section', language: 'lv' });
    }
    if (context.duplicateMetaTitle && normalizeMeta(metaTitle) === normalizeMeta(context.initialMetaTitle)) {
        issues.push({ key: 'duplicateMetaTitle', label: l('metaTitle повторяется у другого товара', 'metaTitle is duplicated by another product', 'metaTitle atkārtojas citai precei'), targetId: 'product-meta-title', sectionId: 'product-form-seo-section' });
    }
    if (context.duplicateMetaDescription && normalizeMeta(metaDescription) === normalizeMeta(context.initialMetaDescription)) {
        issues.push({ key: 'duplicateMetaDescription', label: l('metaDescription повторяется у другого товара', 'metaDescription is duplicated by another product', 'metaDescription atkārtojas citai precei'), targetId: 'product-meta-description', sectionId: 'product-form-seo-section' });
    }

    const focusIssue = (issue: SeoIssue): void => {
        if (issue.language) onSelectLanguage(issue.language);
        const section = document.getElementById(issue.sectionId);
        if (section instanceof HTMLDetailsElement) section.open = true;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const target = document.getElementById(issue.targetId);
            target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target?.focus({ preventScroll: true });
        }));
    };

    return (
        <div aria-live="polite" className={`mb-4 rounded-xl border p-4 ${issues.length ? 'border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/20' : 'border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/20'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    {issues.length ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                    <p className="font-semibold">
                        {issues.length
                            ? l(`SEO-проблем: ${issues.length}`, `SEO issues: ${issues.length}`, `SEO problēmas: ${issues.length}`)
                            : l('Все SEO-проблемы исправлены', 'All SEO issues are fixed', 'Visas SEO problēmas ir novērstas')}
                    </p>
                </div>
                <Link href={context.returnTo} className="text-sm font-medium text-primary hover:underline">
                    ← {l('Вернуться в SEO-отчёт', 'Back to SEO report', 'Atpakaļ uz SEO pārskatu')}
                </Link>
            </div>
            {issues.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                    {issues.map((issue) => (
                        <li key={issue.key}>
                            <button type="button" onClick={() => focusIssue(issue)} className="text-left text-sm text-amber-900 underline-offset-4 hover:text-primary hover:underline dark:text-amber-200">
                                ✕ {issue.label}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
