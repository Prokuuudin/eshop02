import React from 'react';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { IconClose } from '@/components/ui/icon-close';
import type { UseImageZoomResult } from '@/hooks/useImageZoom';

interface ZoomPartProps {
    zoom: UseImageZoomResult;
}

/**
 * Линза внутри квадратного контейнера превью. Позицию и размер задаёт
 * useImageZoom напрямую через style (translate3d), сюда приходит только
 * состояние видимости для fade-анимации.
 */
export const ProductZoomLens: React.FC<ZoomPartProps> = ({ zoom }) => (
    <div
        ref={zoom.lensRef}
        aria-hidden="true"
        className="product-detail__zoom-lens pointer-events-none absolute left-0 top-0 z-10"
    >
        <div
            className={`h-full w-full rounded-sm border border-primary/40 bg-primary/10 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
                zoom.visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
            }`}
        />
    </div>
);

/**
 * Панель увеличенного фрагмента. В режиме 'side' — квадрат того же размера
 * справа от превью, в 'inline' — поверх превью. Сдвиг/масштаб картинки внутри
 * задаёт useImageZoom, режимы отличаются только позиционированием панели.
 */
export const ProductZoomPane: React.FC<ZoomPartProps> = ({ zoom }) => (
    <div
        ref={zoom.paneRef}
        aria-hidden="true"
        className={`product-detail__zoom-pane pointer-events-none absolute z-30 overflow-hidden rounded-lg border border-border bg-white shadow-lg transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
            zoom.effectivePaneMode === 'side' ? 'left-full top-0 ml-4 h-full w-full' : 'inset-0'
        } ${zoom.visible ? 'scale-100 opacity-100' : 'scale-[0.98] opacity-0'}`}
    >
        {/* обычный <img>: размеры и сдвиг в px задаёт хук, srcset от next/image здесь только мешал бы */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
            ref={zoom.paneImgRef}
            src={zoom.paneSrc}
            alt=""
            draggable={false}
            className="block max-w-none select-none"
        />
    </div>
);

/**
 * Полноэкранный просмотр для touch-устройств (открывается тапом по превью).
 * Панорамирование — нативный скролл контейнера, без кастомных жестов.
 */
export const ProductImageLightbox: React.FC<ZoomPartProps & { title: string }> = ({
    zoom,
    title,
}) => {
    const scrollRef = React.useRef<HTMLDivElement>(null);

    // Стартуем с центра увеличенной картинки — как правило, там сам товар
    const centerScroll = React.useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
        el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    }, []);

    React.useEffect(() => {
        if (zoom.lightboxOpen) requestAnimationFrame(centerScroll);
    }, [zoom.lightboxOpen, centerScroll]);

    return (
        <Dialog open={zoom.lightboxOpen} onOpenChange={zoom.setLightboxOpen}>
            <DialogContent
                aria-describedby={undefined}
                className="product-detail__zoom-lightbox left-0 top-0 block h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-white p-0 sm:rounded-none motion-reduce:animate-none"
            >
                <DialogTitle className="sr-only">{title}</DialogTitle>
                <DialogClose asChild>
                    <button
                        type="button"
                        aria-label="Закрыть увеличенное изображение"
                        className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-foreground shadow-md"
                    >
                        <IconClose width={28} height={28} />
                    </button>
                </DialogClose>
                <div ref={scrollRef} className="h-full w-full overflow-auto overscroll-contain">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={zoom.paneSrc}
                        alt={title}
                        draggable={false}
                        className="max-w-none"
                        style={{ width: `${zoom.zoomFactor * 100}%` }}
                        onLoad={centerScroll}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
};
