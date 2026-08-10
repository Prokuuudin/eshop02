'use client';

import React from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AddProductFormValues } from './productFormSchema';
import ProductImageCropTool from './ProductImageCropTool';

const ProductGalleryFields: React.FC<{ productId?: string }> = ({ productId }) => {
    const { register, control, formState: { errors } } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'images' as never });
    const videos = useFieldArray({ control, name: 'demoVideo' });

    return (
        <div className="add-product__section add-product__section--gallery">
            <h2 className="add-product__section-title">Изображения</h2>
            <div className="add-product__fields-grid">
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="add-product-image">
                        Главное изображение (URL)
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
                    <p className="block text-sm font-medium mb-2">Галерея</p>
                    <div className="flex flex-col gap-2">
                        {(fields as { id: string }[]).map((field, index) => (
                            <div key={field.id} className="flex gap-2">
                                <Input
                                    placeholder={`Изображение ${index + 1} (URL)`}
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
                            + Добавить изображение
                        </Button>
                    </div>
                </div>
                <div>
                    <p className="block text-sm font-medium mb-2">Демо-видео</p>
                    <p className="text-xs text-muted-foreground mb-2">
                        Показываются в галерее на странице товара (mp4/webm или ссылка на видео)
                    </p>
                    <div className="flex flex-col gap-2">
                        {videos.fields.map((field, index) => (
                            <div key={field.id} className="flex gap-2">
                                <Input
                                    placeholder="URL видео (src)"
                                    {...register(`demoVideo.${index}.src` as const)}
                                />
                                <Input
                                    placeholder="URL постера (необязательно)"
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
                            + Добавить видео
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductGalleryFields;
