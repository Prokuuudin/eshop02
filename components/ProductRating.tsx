import React from 'react';
import RatingDisplay from '@/components/RatingDisplay';

interface ProductRatingProps {
    rating: number;
    count: number;
}

export const ProductRating: React.FC<ProductRatingProps> = ({ rating, count }) => (
    <div className="product-detail__rating mt-4">
        <RatingDisplay rating={rating} count={count} />
    </div>
);
