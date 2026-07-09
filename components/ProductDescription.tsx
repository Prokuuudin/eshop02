import React from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ProductDescriptionProps {
    description: string;
    features?: string[];
    productId: string;
}

export const ProductDescription: React.FC<ProductDescriptionProps> = ({
    description,
    features,
    productId,
}) => {
    const { t } = useTranslation();
    const paragraphs = description
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

    return (
        <div className="product-detail__description mt-6">
            <Tabs defaultValue="description">
                <TabsList>
                    <TabsTrigger value="description">{t('product.description')}</TabsTrigger>
                    <TabsTrigger value="usage">{t('product.usage')}</TabsTrigger>
                    <TabsTrigger value="application">{t('product.application')}</TabsTrigger>
                </TabsList>
                <TabsContent value="description" className="text-gray-700 dark:text-gray-300">
                    {paragraphs.length > 0 ? (
                        <div className="space-y-2">
                            {paragraphs.map((paragraph, index) => (
                                <p key={`${productId}-desc-${index}`} className="whitespace-pre-line">
                                    {paragraph}
                                </p>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm italic text-gray-400 dark:text-gray-500">
                            {t('product.noDescription')}
                        </p>
                    )}
                    {Array.isArray(features) && features.length > 0 && (
                        <ul className="list-disc list-inside mt-3 text-sm space-y-1">
                            {features.map((feature, index) => (
                                <li key={`${productId}-feature-${index}`}>{feature}</li>
                            ))}
                        </ul>
                    )}
                </TabsContent>
                <TabsContent value="usage" className="text-sm italic text-gray-400 dark:text-gray-500">
                    {t('product.noInfo')}
                </TabsContent>
                <TabsContent value="application" className="text-sm italic text-gray-400 dark:text-gray-500">
                    {t('product.noInfo')}
                </TabsContent>
            </Tabs>
        </div>
    );
};
