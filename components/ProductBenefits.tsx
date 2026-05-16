import React from 'react';
import BenefitsList from '@/components/BenefitsList';

export const ProductBenefits: React.FC = () => {
    return (
        <div className="product-detail__benefits mt-4">
            <BenefitsList compact />
        </div>
    );
};
