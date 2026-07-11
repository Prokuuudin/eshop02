import React from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ProductDescriptionProps {
    description: string;
    features?: string[];
    ingredients?: string;
    productId: string;
}

export const ProductDescription: React.FC<ProductDescriptionProps> = ({
    description,
    features,
    ingredients,
    productId,
}) => {
    const { t } = useTranslation();
    const paragraphs = description
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
    const featureList = Array.isArray(features) ? features.filter(Boolean) : [];
    const ingredientParagraphs = (ingredients ?? '')
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

    // Табы без содержимого не показываем; если контента нет ни в одном — блок скрыт целиком.
    const hasDescription = paragraphs.length > 0 || featureList.length > 0;
    const hasIngredients = ingredientParagraphs.length > 0;
    if (!hasDescription && !hasIngredients) {
        return null;
    }

    return (
        <div className="product-detail__description mt-6">
            <Tabs defaultValue={hasDescription ? 'description' : 'ingredients'}>
                <TabsList>
                    {hasDescription && (
                        <TabsTrigger value="description">{t('product.description')}</TabsTrigger>
                    )}
                    {hasIngredients && (
                        <TabsTrigger value="ingredients">{t('product.ingredients')}</TabsTrigger>
                    )}
                </TabsList>
                {hasDescription && (
                    <TabsContent value="description" className="text-gray-700 dark:text-gray-300">
                        {paragraphs.length > 0 && (
                            <div className="space-y-2">
                                {paragraphs.map((paragraph, index) => (
                                    <p key={`${productId}-desc-${index}`} className="whitespace-pre-line">
                                        {paragraph}
                                    </p>
                                ))}
                            </div>
                        )}
                        {featureList.length > 0 && (
                            <ul className="list-disc list-inside mt-3 text-sm space-y-1">
                                {featureList.map((feature, index) => (
                                    <li key={`${productId}-feature-${index}`}>{feature}</li>
                                ))}
                            </ul>
                        )}
                    </TabsContent>
                )}
                {hasIngredients && (
                    <TabsContent value="ingredients" className="text-gray-700 dark:text-gray-300">
                        <div className="space-y-2">
                            {ingredientParagraphs.map((paragraph, index) => (
                                <p key={`${productId}-ingredients-${index}`} className="whitespace-pre-line">
                                    {paragraph}
                                </p>
                            ))}
                        </div>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
};
