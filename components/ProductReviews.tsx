import React from 'react';
import Reviews from '@/components/Reviews';

interface ProductReviewsProps {
    productId: string;
}

export const ProductReviews: React.FC<ProductReviewsProps> = ({ productId }) => {
    return <Reviews productId={productId} />;
};
