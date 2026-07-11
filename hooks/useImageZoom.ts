import React from 'react';
import {
    clampLensTopLeft,
    computeContainBox,
    isInsideBox,
    lensSizeFor,
    paneImageLayout,
    type Point,
    type Size,
} from '@/lib/image-zoom-geometry';

export type ZoomPaneMode = 'side' | 'inline';

export interface UseImageZoomOptions {
    /** URL картинки, показанной сейчас в превью (images[activeImage]) */
    src: string;
    /** Опциональный hi-res источник для панели; без него увеличивается обычный src */
    hiResSrc?: string;
    /** Кратность увеличения относительно размера превью (2/3/4) */
    zoomFactor?: number;
    /** 'side' — панель справа от картинки (desktop), 'inline' — поверх картинки */
    paneMode?: ZoomPaneMode;
    /** Внутренний отступ картинки в контейнере в px (Tailwind p-2 = 8) */
    imagePadding?: number;
    disabled?: boolean;
}

export interface UseImageZoomResult {
    /** Линза/панель смонтированы в DOM (после первого наведения мыши) */
    mounted: boolean;
    /** Курсор сейчас над фактически отрисованной картинкой — зум показан */
    visible: boolean;
    zoomFactor: number;
    effectivePaneMode: ZoomPaneMode;
    paneSrc: string;
    lightboxOpen: boolean;
    setLightboxOpen: (open: boolean) => void;
    containerProps: {
        ref: React.Ref<HTMLDivElement>;
        onPointerEnter: React.PointerEventHandler<HTMLDivElement>;
        onPointerMove: React.PointerEventHandler<HTMLDivElement>;
        onPointerLeave: React.PointerEventHandler<HTMLDivElement>;
        onPointerCancel: React.PointerEventHandler<HTMLDivElement>;
        onPointerDown: React.PointerEventHandler<HTMLDivElement>;
        onClick: React.MouseEventHandler<HTMLDivElement>;
    };
    /** Вешается на onLoad превью-<Image> — без natural-размеров letterbox не посчитать */
    onImageLoad: React.ReactEventHandler<HTMLImageElement>;
    lensRef: React.RefObject<HTMLDivElement>;
    paneRef: React.RefObject<HTMLDivElement>;
    paneImgRef: React.RefObject<HTMLImageElement>;
}

// Ниже lg боковой панели не хватает места (контейнер sm:w-1/2 в колонке грида) —
// переключаемся в режим "поверх картинки".
const SIDE_PANE_MEDIA = '(min-width: 1024px)';

export function useImageZoom({
    src,
    hiResSrc,
    zoomFactor = 2.5,
    paneMode = 'side',
    imagePadding = 0,
    disabled = false,
}: UseImageZoomOptions): UseImageZoomResult {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const lensRef = React.useRef<HTMLDivElement>(null);
    const paneRef = React.useRef<HTMLDivElement>(null);
    const paneImgRef = React.useRef<HTMLImageElement>(null);

    const naturalRef = React.useRef<Size | null>(null);
    const pointerInsideRef = React.useRef(false);
    const lastPointRef = React.useRef<Point | null>(null);
    const rafRef = React.useRef<number | null>(null);
    const lastPointerTypeRef = React.useRef('');

    const [mounted, setMounted] = React.useState(false);
    const [visible, setVisible] = React.useState(false);
    const [lightboxOpen, setLightboxOpen] = React.useState(false);
    const [sidePaneFits, setSidePaneFits] = React.useState(false);

    const frame = React.useCallback(() => {
        rafRef.current = null;
        const container = containerRef.current;
        const natural = naturalRef.current;
        const point = lastPointRef.current;
        if (!container || !natural || !point || !pointerInsideRef.current) return;
        // rect читаем каждый кадр: один getBoundingClientRect дешевле, чем
        // инвалидация кэша на scroll/resize/сдвигах layout'а
        const rect = container.getBoundingClientRect();
        const box = computeContainBox(rect, natural, imagePadding);
        const cursor: Point = { x: point.x - rect.left, y: point.y - rect.top };
        const inside = isInsideBox(cursor, box);
        setVisible(inside);
        if (!inside) return;
        const lens = lensSizeFor(box, rect, zoomFactor);
        const lensPos = clampLensTopLeft(cursor, lens, box);
        const lensEl = lensRef.current;
        if (lensEl) {
            lensEl.style.width = `${lens.width}px`;
            lensEl.style.height = `${lens.height}px`;
            lensEl.style.transform = `translate3d(${lensPos.x}px, ${lensPos.y}px, 0)`;
        }
        const imgEl = paneImgRef.current;
        if (imgEl) {
            const layout = paneImageLayout(lensPos, box, zoomFactor);
            imgEl.style.width = `${layout.width}px`;
            imgEl.style.height = `${layout.height}px`;
            imgEl.style.transform = `translate3d(${layout.x}px, ${layout.y}px, 0)`;
        }
    }, [imagePadding, zoomFactor]);

    const schedule = React.useCallback(() => {
        if (rafRef.current == null) rafRef.current = requestAnimationFrame(frame);
    }, [frame]);

    const stop = React.useCallback(() => {
        pointerInsideRef.current = false;
        if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        setVisible(false);
    }, []);

    // Смена картинки: старые natural-размеры невалидны, зум прячем до onLoad новой
    React.useEffect(() => {
        naturalRef.current = null;
        setVisible(false);
    }, [src]);

    React.useEffect(
        () => () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        },
        [],
    );

    // Линза/панель появляются в DOM только после setMounted — доводим их до позиции курсора
    React.useEffect(() => {
        if (mounted) schedule();
    }, [mounted, schedule]);

    React.useEffect(() => {
        if (!mounted) return;
        const mq = window.matchMedia(SIDE_PANE_MEDIA);
        const update = () => setSidePaneFits(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, [mounted]);

    // resize/смена ориентации при активном зуме — пересчёт без движения мыши
    React.useEffect(() => {
        if (!visible) return;
        const onResize = () => schedule();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [visible, schedule]);

    // will-change только на время активного зума
    React.useEffect(() => {
        if (!visible) return;
        const candidates: (HTMLElement | null)[] = [
            lensRef.current,
            paneRef.current,
            paneImgRef.current,
        ];
        const els = candidates.filter((el): el is HTMLElement => el != null);
        els.forEach((el) => {
            el.style.willChange = 'transform';
        });
        return () =>
            els.forEach((el) => {
                el.style.willChange = '';
            });
    }, [visible]);

    const onPointerEnter: React.PointerEventHandler<HTMLDivElement> = (event) => {
        if (disabled || event.pointerType !== 'mouse') return;
        pointerInsideRef.current = true;
        lastPointRef.current = { x: event.clientX, y: event.clientY };
        if (!mounted) setMounted(true);
        schedule();
    };

    const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
        if (disabled || event.pointerType !== 'mouse') return;
        lastPointRef.current = { x: event.clientX, y: event.clientY };
        if (pointerInsideRef.current) schedule();
    };

    const onPointerLeave: React.PointerEventHandler<HTMLDivElement> = () => stop();
    const onPointerCancel: React.PointerEventHandler<HTMLDivElement> = () => stop();

    const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
        lastPointerTypeRef.current = event.pointerType;
    };

    // Тап на touch-устройстве открывает полноэкранный просмотр; клик мыши
    // игнорируем — на desktop работает hover-зум
    const onClick: React.MouseEventHandler<HTMLDivElement> = () => {
        if (disabled || lastPointerTypeRef.current !== 'touch') return;
        setLightboxOpen(true);
    };

    const onImageLoad: React.ReactEventHandler<HTMLImageElement> = (event) => {
        const img = event.currentTarget;
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            naturalRef.current = { width: img.naturalWidth, height: img.naturalHeight };
        }
        // курсор мог остаться внутри контейнера, пока картинка грузилась/менялась
        if (pointerInsideRef.current) schedule();
    };

    return {
        mounted,
        visible,
        zoomFactor,
        effectivePaneMode: paneMode === 'side' && sidePaneFits ? 'side' : 'inline',
        paneSrc: hiResSrc || src,
        lightboxOpen,
        setLightboxOpen,
        containerProps: {
            ref: containerRef,
            onPointerEnter,
            onPointerMove,
            onPointerLeave,
            onPointerCancel,
            onPointerDown,
            onClick,
        },
        onImageLoad,
        lensRef,
        paneRef,
        paneImgRef,
    };
}
