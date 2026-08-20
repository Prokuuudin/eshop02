import React from 'react';
import Image from 'next/image';
import { useImageZoom } from '@/hooks/useImageZoom';
import { deriveHiResSrc } from '@/lib/image-hires';
import {
    ProductImageLightbox,
    ProductZoomLens,
    ProductZoomPane,
} from '@/components/ProductImageZoom';

interface ProductGalleryProps {
    images: string[];
    /** Опциональные hi-res версии для зума, индексы совпадают с images */
    hiResImages?: string[];
    title: string;
    zoomFactor?: number;
}

export const ProductGallery: React.FC<ProductGalleryProps> = ({
    images,
    hiResImages,
    title,
    zoomFactor = 2.5,
}) => {
    const [activeImage, setActiveImage] = React.useState(0);

    const activeSrc = images[activeImage];
    const zoom = useImageZoom({
        src: activeSrc ?? '',
        // явный hi-res приоритетнее; иначе пробуем оригинал nopCommerce без _400
        hiResSrc: hiResImages?.[activeImage] ?? (activeSrc ? deriveHiResSrc(activeSrc) : undefined),
        zoomFactor,
        // p-2 на <Image> ниже — при изменении отступа синхронизировать
        imagePadding: 8,
        disabled: !activeSrc,
    });

    return (
        <div className="product-detail__image">
            {/* Галерея изображений */}
            <div className="product-detail__zoom-root relative mx-auto w-full sm:w-1/2">
                <div
                    {...zoom.containerProps}
                    className={`product-image-surface relative aspect-square rounded-lg overflow-hidden flex items-center justify-center ${
                        zoom.visible ? 'cursor-none' : ''
                    }`}
                >
                    {images.length > 0 && (
                        <Image
                            key={activeSrc}
                            src={activeSrc}
                            alt={title}
                            fill
                            className="object-contain p-2"
                            sizes="(max-width: 640px) 100vw, 50vw"
                            onLoad={zoom.onImageLoad}
                        />
                    )}
                    {zoom.mounted && <ProductZoomLens lensRef={zoom.lensRef} visible={zoom.visible} />}
                </div>
                {zoom.mounted && (
                    <ProductZoomPane
                        paneRef={zoom.paneRef}
                        paneImgRef={zoom.paneImgRef}
                        paneSrc={zoom.paneSrc}
                        effectivePaneMode={zoom.effectivePaneMode}
                        visible={zoom.visible}
                        onPaneImgError={zoom.onPaneImgError}
                    />
                )}
                <ProductImageLightbox
                    open={zoom.lightboxOpen}
                    onOpenChange={zoom.setLightboxOpen}
                    images={images}
                    hiResImages={hiResImages}
                    activeIndex={activeImage}
                    onIndexChange={setActiveImage}
                    title={title}
                />
            </div>
            {images.length > 1 && (
                <div className="product-detail__thumbs mt-3 overflow-x-auto">
                    <div className="flex gap-2 w-max mx-auto px-1 pb-1">
                    {images.map((img, idx) => (
                        <button
                            key={img}
                            type="button"
                            className={`product-detail__thumb flex-shrink-0 rounded border-2 transition-all ${
                                activeImage === idx
                                    ? 'border-primary ring-2 ring-primary/50'
                                    : 'border-transparent opacity-70 hover:opacity-100'
                            } product-image-surface`}
                            style={{ width: 48, height: 48, overflow: 'hidden' }}
                            onClick={() => setActiveImage(idx)}
                            aria-label={`Показать изображение ${idx + 1}`}
                        >
                            <Image
                                src={img}
                                alt={title + ' preview'}
                                width={48}
                                height={48}
                                className="object-contain w-full h-full"
                            />
                        </button>
                    ))}
                    </div>
                </div>
            )}
        </div>
    );
};
