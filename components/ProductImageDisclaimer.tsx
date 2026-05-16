import React from 'react';
import { useTranslation } from '@/lib/use-translation';

export const ProductImageDisclaimer: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div className="product-detail__image-disclaimer shadcn-alert mt-2 px-3 py-2 rounded bg-yellow-50 border border-yellow-300 text-yellow-900 text-xs">
            {t('product.imageDisclaimer')}
        </div>
    );
};
