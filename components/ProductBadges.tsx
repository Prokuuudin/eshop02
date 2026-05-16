import React from 'react';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/use-translation';
import { Product } from '@/data/products';

type Props = {
    badges?: Product['badges'];
};

export const ProductBadges: React.FC<Props> = ({ badges }) => {
    const { t } = useTranslation();
    if (!badges || badges.length === 0) return null;
    return (
        <div className="product-detail__badges flex gap-2 mt-4">
            {badges.includes('sale') && (
                <Badge className="bg-red-600 text-white">{t('product.sale')}</Badge>
            )}
            {badges.includes('new') && (
                <Badge className="bg-green-600 text-white">{t('product.new')}</Badge>
            )}
            {badges.includes('bestseller') && (
                <Badge className="bg-yellow-600 text-black">{t('product.bestseller')}</Badge>
            )}
        </div>
    );
};
