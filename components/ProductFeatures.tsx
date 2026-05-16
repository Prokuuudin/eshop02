import React from 'react';

interface ProductFeaturesProps {
    features: string[];
}

export const ProductFeatures: React.FC<ProductFeaturesProps> = ({ features }) => {
    if (!features || features.length === 0) return null;
    return (
        <ul className="product-detail__features list-disc pl-5 mb-4">
            {features.map((feature, idx) => (
                <li key={idx}>{feature}</li>
            ))}
        </ul>
    );
};
