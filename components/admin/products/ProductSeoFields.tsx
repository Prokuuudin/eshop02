import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AddProductFormValues, Language } from './productFormSchema';

interface ProductSeoFieldsProps {
    language: Language;
}

const ProductSeoFields: React.FC<ProductSeoFieldsProps> = ({ language }) => {
    const {
        register,
        formState: { errors },
    } = useFormContext<AddProductFormValues>();

    return (
        <div className="add-product__section add-product__section--seo">
            <h2 className="add-product__section-title">SEO</h2>
            <div className="add-product__fields-grid">
                <Input
                    label={`Meta Title (${language.toUpperCase()})`}
                    {...register(`metaTitles.${language}`)}
                    error={errors.metaTitles?.[language]?.message}
                />
                <Textarea
                    label={`Meta Description (${language.toUpperCase()})`}
                    {...register(`metaDescriptions.${language}`)}
                    error={errors.metaDescriptions?.[language]?.message}
                />
                <Input label="Слаг" {...register('slug')} error={errors.slug?.message} />
            </div>
        </div>
    );
};

export default ProductSeoFields;
