import React from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ProductDescriptionProps {
    description: string;
    features?: string[];
    ingredients?: string;
    application?: string;
    warnings?: string;
    productId: string;
}

const toParagraphs = (text: string | undefined): string[] =>
    (text ?? '')
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

export const ProductDescription: React.FC<ProductDescriptionProps> = ({
    description,
    features,
    ingredients,
    application,
    warnings,
    productId,
}) => {
    const { t } = useTranslation();
    const paragraphs = toParagraphs(description);
    const featureList = Array.isArray(features) ? features.filter(Boolean) : [];
    const ingredientParagraphs = toParagraphs(ingredients);
    const applicationParagraphs = toParagraphs(application);
    const warningsParagraphs = toParagraphs(warnings);

    // Табы без содержимого не показываем; если контента нет ни в одном — блок скрыт целиком.
    const tabs = [
        {
            value: 'description',
            label: t('product.description'),
            paragraphs,
            visible: paragraphs.length > 0 || featureList.length > 0,
        },
        {
            value: 'ingredients',
            label: t('product.ingredients'),
            paragraphs: ingredientParagraphs,
            visible: ingredientParagraphs.length > 0,
        },
        {
            value: 'application',
            label: t('product.application'),
            paragraphs: applicationParagraphs,
            visible: applicationParagraphs.length > 0,
        },
        {
            value: 'warnings',
            label: t('product.warnings'),
            paragraphs: warningsParagraphs,
            visible: warningsParagraphs.length > 0,
        },
    ].filter((tab) => tab.visible);

    if (tabs.length === 0) {
        return null;
    }

    return (
        <div className="product-detail__description mt-6">
            <Tabs defaultValue={tabs[0].value}>
                <TabsList>
                    {tabs.map((tab) => (
                        <TabsTrigger key={tab.value} value={tab.value}>
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {tabs.map((tab) => (
                    <TabsContent
                        key={tab.value}
                        value={tab.value}
                        className="text-gray-700 dark:text-gray-300"
                    >
                        {tab.paragraphs.length > 0 && (
                            <div className="space-y-2">
                                {tab.paragraphs.map((paragraph, index) => (
                                    <p
                                        key={`${productId}-${tab.value}-${index}`}
                                        className="whitespace-pre-line"
                                    >
                                        {paragraph}
                                    </p>
                                ))}
                            </div>
                        )}
                        {tab.value === 'description' && featureList.length > 0 && (
                            <ul className="list-disc list-inside mt-3 text-sm space-y-1">
                                {featureList.map((feature, index) => (
                                    <li key={`${productId}-feature-${index}`}>{feature}</li>
                                ))}
                            </ul>
                        )}
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
};
