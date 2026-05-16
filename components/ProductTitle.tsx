import React from 'react';
import { useTranslation } from '@/lib/use-translation';

type Props = {
    title: string;
};

export const ProductTitle: React.FC<Props> = ({ title }) => {
    const { t } = useTranslation();
    return <h1 className="product-detail__title text-3xl font-bold mt-2">{title}</h1>;
};
