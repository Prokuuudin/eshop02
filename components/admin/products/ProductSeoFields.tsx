import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AddProductFormValues } from './productFormSchema';

const ProductSeoFields: React.FC = () => {
    const { register } = useFormContext<AddProductFormValues>();

    return (
        <div className="add-product__section add-product__section--seo">
            <h2 className="add-product__section-title">SEO</h2>
            <div className="add-product__fields-grid">
                <div>
                    <label className="block text-sm font-medium mb-1">Meta Title</label>
                    <Input placeholder="Заголовок для поисковых систем" {...register('metaTitle')} />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Meta Description</label>
                    <Textarea placeholder="Описание для поисковых систем" {...register('metaDescription')} />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">OG Image (URL)</label>
                    <Input placeholder="https://example.com/og.jpg" {...register('ogImage')} />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">OG Alt</label>
                    <Input placeholder="Описание OG-изображения" {...register('ogAlt')} />
                </div>
            </div>
        </div>
    );
};

export default ProductSeoFields;
