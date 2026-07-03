import React from 'react';
import { useTranslation } from '@/lib/use-translation';

export const ProductImageDisclaimer: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div className="product-detail__image-disclaimer mt-2 text-muted-foreground text-xs">
            {t('product.imageDisclaimer')}
        </div>
    );
};
