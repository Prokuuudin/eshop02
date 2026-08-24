'use client';

import React from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AddProductFormValues } from './productFormSchema';
import ProductImageCropTool from './ProductImageCropTool';
import { useAdminLocale } from '@/lib/use-admin-locale';

const ProductGalleryFields: React.FC<{ productId?: string }> = ({ productId }) => {
    const { register, control, formState: { errors } } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'images' as never });
    const videos = useFieldArray({ control, name: 'demoVideo' });
    const { l } = useAdminLocale();

    return (
        <div className="add-product__section add-product__section--gallery">
            <h2 className="add-product__section-title">{l('Изображения', 'Images', 'Attēli')}</h2>
            <div className="add-product__fields-grid add-product__gallery-grid">
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-image">
                        {l('Главное изображение (URL)', 'Main image (URL)', 'Galvenais attēls (URL)')}
                    </label>
                    <Input
                        id="add-product-image"
                        placeholder="https://example.com/image.jpg"
                        {...register('image')}
                    />
                    {errors.image?.message && (
                        <div className="text-red-500 text-xs mt-1">{errors.image.message}</div>
                    )}
                    {productId && <ProductImageCropTool productId={productId} />}
                </div>
                <div>
                    <p className="block text-sm font-medium mb-2">{l('Галерея', 'Gallery', 'Galerija')}</p>
                    <div className="flex flex-col gap-2">
                        {(fields as { id: string }[]).map((field, index) => (
                            <div key={field.id} className="flex gap-2">
                                <Input
                                    placeholder={l(`Изображение ${index + 1} (URL)`, `Image ${index + 1} (URL)`, `Attēls ${index + 1} (URL)`)}
                                    {...register(`images.${index}` as const)}
                                />
                                <Button type="button" variant="destructive" size="sm" onClick={() => remove(index)}>
                                    ✕
                                </Button>
                            </div>
                        ))}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-1 self-start"
                            onClick={() => append('' as never)}
                        >
                            + {l('Добавить изображение', 'Add image', 'Pievienot attēlu')}
                        </Button>
                    </div>
                </div>
                <div>
                    <p className="block text-sm font-medium mb-2">{l('Демо-видео', 'Demo videos', 'Demonstrācijas video')}</p>
                    <div className="flex flex-col gap-2">
                        {videos.fields.map((field, index) => (
                            <div key={field.id} className="flex gap-2">
                                <Input
                                    placeholder={l('URL видео (src)', 'Video URL (src)', 'Video URL (src)')}
                                    {...register(`demoVideo.${index}.src` as const)}
                                />
                                <Input
                                    placeholder={l('URL постера (необязательно)', 'Poster URL (optional)', 'Plakāta URL (neobligāti)')}
                                    {...register(`demoVideo.${index}.poster` as const)}
                                />
                                <Button type="button" variant="destructive" size="sm" onClick={() => videos.remove(index)}>
                                    ✕
                                </Button>
                            </div>
                        ))}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-1 self-start"
                            onClick={() => videos.append({ src: '', poster: '' })}
                        >
                            + {l('Добавить видео', 'Add video', 'Pievienot video')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductGalleryFields;
