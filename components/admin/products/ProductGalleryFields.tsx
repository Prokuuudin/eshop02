'use client';

import React from 'react';
import Image from 'next/image';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AddProductFormValues } from './productFormSchema';
import ProductImageCropTool from './ProductImageCropTool';
import { useAdminLocale } from '@/lib/use-admin-locale';

const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

const ProductGalleryFields: React.FC<{ productId?: string }> = ({ productId }) => {
    const { register, control, setValue, formState: { errors } } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'images' as never });
    const videos = useFieldArray({ control, name: 'demoVideo' });
    const { l } = useAdminLocale();
    const image = useWatch({ control, name: 'image' });
    const images = useWatch({ control, name: 'images' }) ?? [];
    const [uploadingMain, setUploadingMain] = React.useState(false);
    const [uploadingGallery, setUploadingGallery] = React.useState(false);
    const [uploadError, setUploadError] = React.useState('');

    const uploadImage = async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.set('file', file);
        const response = await fetch('/api/admin/content/upload', { method: 'POST', body: formData });
        const result = await response.json().catch(() => ({})) as { path?: string; error?: string };
        if (!response.ok || !result.path) {
            const message = result.error === 'file_too_large'
                ? l('Файл превышает 10 МБ', 'The file exceeds 10 MB', 'Fails pārsniedz 10 MB')
                : result.error === 'unsupported_file_type'
                    ? l('Неподдерживаемый формат изображения', 'Unsupported image format', 'Neatbalstīts attēla formāts')
                    : l('Не удалось загрузить изображение', 'Failed to upload image', 'Neizdevās augšupielādēt attēlu');
            throw new Error(message);
        }
        return result.path;
    };

    const handleMainUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setUploadingMain(true);
        setUploadError('');
        try {
            const path = await uploadImage(file);
            setValue('image', path, { shouldDirty: true, shouldValidate: true });
        } catch (error) {
            setUploadError(error instanceof Error ? error.message : l('Ошибка загрузки', 'Upload failed', 'Augšupielādes kļūda'));
        } finally {
            setUploadingMain(false);
        }
    };

    const handleGalleryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (!files.length) return;
        setUploadingGallery(true);
        setUploadError('');
        try {
            const paths = await Promise.all(files.map(uploadImage));
            paths.forEach((path) => append(path as never));
        } catch (error) {
            setUploadError(error instanceof Error ? error.message : l('Ошибка загрузки', 'Upload failed', 'Augšupielādes kļūda'));
        } finally {
            setUploadingGallery(false);
        }
    };

    return (
        <div className="add-product__section add-product__section--gallery">
            <h2 className="add-product__section-title">{l('Изображения', 'Images', 'Attēli')}</h2>
            <div className="add-product__fields-grid add-product__gallery-grid">
                <div>
                    <label className="mb-1 block text-sm font-medium" htmlFor="add-product-image">
                        {l('Главное изображение (URL)', 'Main image (URL)', 'Galvenais attēls (URL)')}
                    </label>
                    <Input id="add-product-image" placeholder="https://example.com/image.jpg" {...register('image')} />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center">
                            <input type="file" accept={ACCEPTED_IMAGE_TYPES} className="sr-only" disabled={uploadingMain} onChange={(event) => void handleMainUpload(event)} />
                            <span className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">
                                {uploadingMain ? l('Загрузка…', 'Uploading…', 'Augšupielāde…') : l('Выбрать с компьютера', 'Choose from computer', 'Izvēlēties no datora')}
                            </span>
                        </label>
                        <span className="text-xs text-muted-foreground">JPEG, PNG, WebP, GIF, AVIF · {l('до 10 МБ', 'up to 10 MB', 'līdz 10 MB')}</span>
                    </div>
                    {image && (
                        <div className="product-image-surface mt-3 flex h-36 w-36 items-center justify-center overflow-hidden rounded-md border border-border">
                            <Image unoptimized src={image} alt={l('Главное изображение товара', 'Main product image', 'Preces galvenais attēls')} width={144} height={144} className="h-full w-full object-contain p-2" />
                        </div>
                    )}
                    {errors.image?.message && <div className="mt-1 text-xs text-red-500">{errors.image.message}</div>}
                    {productId && <ProductImageCropTool productId={productId} />}
                </div>

                <div>
                    <p className="mb-2 block text-sm font-medium">{l('Галерея', 'Gallery', 'Galerija')}</p>
                    <div className="flex flex-col gap-2">
                        {(fields as { id: string }[]).map((field, index) => (
                            <div key={field.id} className="flex items-center gap-2">
                                {images[index] && (
                                    <div className="product-image-surface flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border">
                                        <Image unoptimized src={images[index]} alt="" width={48} height={48} className="h-full w-full object-contain p-1" />
                                    </div>
                                )}
                                <Input placeholder={l(`Изображение ${index + 1} (URL)`, `Image ${index + 1} (URL)`, `Attēls ${index + 1} (URL)`)} {...register(`images.${index}` as const)} />
                                <Button type="button" variant="destructive" size="sm" onClick={() => remove(index)}>×</Button>
                            </div>
                        ))}
                        <div className="mt-1 flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => append('' as never)}>
                                + {l('Добавить URL', 'Add URL', 'Pievienot URL')}
                            </Button>
                            <label className="inline-flex cursor-pointer">
                                <input type="file" accept={ACCEPTED_IMAGE_TYPES} multiple className="sr-only" disabled={uploadingGallery} onChange={(event) => void handleGalleryUpload(event)} />
                                <span className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">
                                    {uploadingGallery ? l('Загрузка…', 'Uploading…', 'Augšupielāde…') : l('Загрузить с компьютера', 'Upload from computer', 'Augšupielādēt no datora')}
                                </span>
                            </label>
                        </div>
                    </div>
                </div>

                <div>
                    <p className="mb-2 block text-sm font-medium">{l('Демо-видео', 'Demo videos', 'Demonstrācijas video')}</p>
                    <div className="flex flex-col gap-2">
                        {videos.fields.map((field, index) => (
                            <div key={field.id} className="flex gap-2">
                                <Input placeholder={l('URL видео (src)', 'Video URL (src)', 'Video URL (src)')} {...register(`demoVideo.${index}.src` as const)} />
                                <Input placeholder={l('URL постера (необязательно)', 'Poster URL (optional)', 'Plakāta URL (neobligāti)')} {...register(`demoVideo.${index}.poster` as const)} />
                                <Button type="button" variant="destructive" size="sm" onClick={() => videos.remove(index)}>×</Button>
                            </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" className="mt-1 self-start" onClick={() => videos.append({ src: '', poster: '' })}>
                            + {l('Добавить видео', 'Add video', 'Pievienot video')}
                        </Button>
                    </div>
                </div>
            </div>
            {uploadError && <p role="alert" className="mt-3 text-sm text-destructive">{uploadError}</p>}
        </div>
    );
};

export default ProductGalleryFields;
