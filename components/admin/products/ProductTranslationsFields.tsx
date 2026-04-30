import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AddProductFormValues, Language } from './productFormSchema';

interface ProductTranslationsFieldsProps {
    language: Language;
}

const ProductTranslationsFields: React.FC<ProductTranslationsFieldsProps> = ({ language }) => {
    const {
        register,
        formState: { errors },
    } = useFormContext<AddProductFormValues>();

    return (
        <div className="add-product__section add-product__section--translations">
            <h2 className="add-product__section-title">Переводы</h2>
            <div className="add-product__fields-grid">
                <Input
                    label={`Название (${language.toUpperCase()})`}
                    {...register(`titles.${language}`)}
                    error={errors.titles?.[language]?.message}
                />
                <Textarea
                    label={`Краткое описание (${language.toUpperCase()})`}
                    {...register(`shortDescriptions.${language}`)}
                    error={errors.shortDescriptions?.[language]?.message}
                />
                <Textarea
                    label={`Полное описание (${language.toUpperCase()})`}
                    {...register(`fullDescriptions.${language}`)}
                    error={errors.fullDescriptions?.[language]?.message}
                />
            </div>
        </div>
    );
};

export default ProductTranslationsFields;
