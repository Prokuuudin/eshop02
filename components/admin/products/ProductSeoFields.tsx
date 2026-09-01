import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AddProductFormValues } from './productFormSchema';
import { useAdminLocale } from '@/lib/use-admin-locale';

const ProductSeoFields: React.FC = () => {
    const { l } = useAdminLocale();
    const { register } = useFormContext<AddProductFormValues>();

    return (
        <div className="add-product__section add-product__section--seo">
            <h2 className="add-product__section-title">SEO</h2>
            <div className="add-product__fields-grid">
                <div>
                    <label htmlFor="product-meta-title" className="block text-sm font-medium mb-1">Meta Title</label>
                    <Input id="product-meta-title" placeholder={l('Заголовок для поисковых систем', 'Search engine title', 'Virsraksts meklētājprogrammām')} {...register('metaTitle')} />
                </div>
                <div>
                    <label htmlFor="product-meta-description" className="block text-sm font-medium mb-1">Meta Description</label>
                    <Textarea id="product-meta-description" placeholder={l('Описание для поисковых систем', 'Search engine description', 'Apraksts meklētājprogrammām')} {...register('metaDescription')} />
                </div>
                <div>
                    <label htmlFor="product-og-image" className="block text-sm font-medium mb-1">{l('Изображение для превью ссылки (OG)', 'Link preview image (OG)', 'Saites priekšskatījuma attēls (OG)')}</label>
                    <Input id="product-og-image" placeholder="https://example.com/og.jpg" {...register('ogImage')} />
                </div>
                <div>
                    <label htmlFor="product-og-alt" className="block text-sm font-medium mb-1">{l('Описание изображения для превью (Alt)', 'Link preview image description (Alt)', 'Saites priekšskatījuma attēla apraksts (Alt)')}</label>
                    <Input id="product-og-alt" placeholder={l('Что изображено на картинке превью', 'Describe the preview image', 'Aprakstiet priekšskatījuma attēlu')} {...register('ogAlt')} />
                </div>
            </div>
        </div>
    );
};

export default ProductSeoFields;
