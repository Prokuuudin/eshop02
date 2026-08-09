import React from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { IconClose } from '@/components/ui/icon-close';
import type { UseImageZoomResult } from '@/hooks/useImageZoom';

// Swiper тянет за собой ~130 KB — грузим только когда лайтбокс реально открыт
const ProductLightboxSwiper = dynamic(() => import('./ProductLightboxSwiper'), { ssr: false });

type ZoomLensProps = Pick<UseImageZoomResult, 'lensRef' | 'visible'>;
type ZoomPaneProps = Pick<
    UseImageZoomResult,
    'paneRef' | 'paneImgRef' | 'paneSrc' | 'effectivePaneMode' | 'visible' | 'onPaneImgError'
>;

/**
 * Линза внутри квадратного контейнера превью. Позицию и размер задаёт
 * useImageZoom напрямую через style (translate3d), сюда приходит только
 * состояние видимости для fade-анимации.
 */
export const ProductZoomLens: React.FC<ZoomLensProps> = ({ lensRef, visible }) => (
    <div
        ref={lensRef}
        aria-hidden="true"
        className="product-detail__zoom-lens pointer-events-none absolute left-0 top-0 z-10"
    >
        <div
            className={`h-full w-full rounded-sm border border-primary/40 bg-primary/10 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
                visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
            }`}
        />
    </div>
);

/**
 * Панель увеличенного фрагмента. В режиме 'side' — квадрат того же размера
 * справа от превью, в 'inline' — поверх превью. Сдвиг/масштаб картинки внутри
 * задаёт useImageZoom, режимы отличаются только позиционированием панели.
 */
export const ProductZoomPane: React.FC<ZoomPaneProps> = ({
    paneRef,
    paneImgRef,
    paneSrc,
    effectivePaneMode,
    visible,
    onPaneImgError,
}) => (
    <div
        ref={paneRef}
        aria-hidden="true"
        className={`product-detail__zoom-pane pointer-events-none absolute z-30 overflow-hidden rounded-lg border border-border bg-white shadow-lg transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
            effectivePaneMode === 'side' ? 'left-full top-0 ml-4 h-full w-full' : 'inset-0'
        } ${visible ? 'scale-100 opacity-100' : 'scale-[0.98] opacity-0'}`}
    >
        {/* обычный <img>: размеры и сдвиг в px задаёт хук, srcset от next/image здесь только мешал бы */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
            ref={paneImgRef}
            src={paneSrc}
            alt=""
            draggable={false}
            className="block max-w-none select-none"
            onError={onPaneImgError}
        />
    </div>
);

export interface ProductImageLightboxProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    images: string[];
    hiResImages?: string[];
    activeIndex: number;
    onIndexChange: (index: number) => void;
    title: string;
}

/**
 * Полноэкранная галерея товара: открывается кликом/тапом по превью,
 * пролистывание остальных фото — свайпом (touch), стрелками или клавиатурой.
 */
export const ProductImageLightbox: React.FC<ProductImageLightboxProps> = ({
    open,
    onOpenChange,
    images,
    hiResImages,
    activeIndex,
    onIndexChange,
    title,
}) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                aria-describedby={undefined}
                className="product-detail__zoom-lightbox left-0 top-0 block h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-white p-0 sm:rounded-none motion-reduce:animate-none"
            >
                <DialogTitle className="sr-only">{title}</DialogTitle>
                <DialogClose asChild>
                    <button
                        type="button"
                        aria-label="Закрыть увеличенное изображение"
                        className="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-foreground shadow-md"
                    >
                        <IconClose width={28} height={28} />
                    </button>
                </DialogClose>
                <div className="h-full w-full p-2 sm:p-8">
                    {open && images.length > 0 && (
                        <ProductLightboxSwiper
                            images={images}
                            hiResImages={hiResImages}
                            title={title}
                            initialIndex={activeIndex}
                            onIndexChange={onIndexChange}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
