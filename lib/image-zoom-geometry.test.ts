import { describe, expect, it } from 'vitest';
import {
    clampLensTopLeft,
    computeContainBox,
    isInsideBox,
    lensSizeFor,
    paneImageLayout,
} from './image-zoom-geometry';

describe('computeContainBox', () => {
    it('letterbox сверху/снизу для широкой картинки', () => {
        const box = computeContainBox({ width: 400, height: 400 }, { width: 200, height: 100 });
        expect(box).toEqual({ left: 0, top: 100, width: 400, height: 200 });
    });

    it('letterbox по бокам для вытянутой картинки', () => {
        const box = computeContainBox({ width: 400, height: 400 }, { width: 100, height: 200 });
        expect(box).toEqual({ left: 100, top: 0, width: 200, height: 400 });
    });

    it('квадратная картинка заполняет контейнер целиком', () => {
        const box = computeContainBox({ width: 400, height: 400 }, { width: 800, height: 800 });
        expect(box).toEqual({ left: 0, top: 0, width: 400, height: 400 });
    });

    it('учитывает внутренний отступ (p-2 = 8px)', () => {
        const box = computeContainBox({ width: 416, height: 416 }, { width: 200, height: 100 }, 8);
        expect(box).toEqual({ left: 8, top: 108, width: 400, height: 200 });
    });

    it('нулевые natural-размеры дают пустой box', () => {
        const box = computeContainBox({ width: 400, height: 400 }, { width: 0, height: 0 });
        expect(box.width).toBe(0);
        expect(box.height).toBe(0);
    });

    it('контейнер меньше отступов даёт пустой box', () => {
        const box = computeContainBox({ width: 10, height: 10 }, { width: 100, height: 100 }, 8);
        expect(box.width).toBe(0);
        expect(box.height).toBe(0);
    });
});

describe('lensSizeFor', () => {
    it('размер линзы = панель / zoomFactor', () => {
        const lens = lensSizeFor({ width: 400, height: 300 }, { width: 400, height: 400 }, 2);
        expect(lens).toEqual({ width: 200, height: 200 });
    });

    it('не больше самой картинки', () => {
        const lens = lensSizeFor({ width: 100, height: 80 }, { width: 400, height: 400 }, 2);
        expect(lens).toEqual({ width: 100, height: 80 });
    });

    it('zoomFactor меньше 1 трактуется как 1', () => {
        const lens = lensSizeFor({ width: 800, height: 800 }, { width: 400, height: 400 }, 0);
        expect(lens).toEqual({ width: 400, height: 400 });
    });
});

describe('clampLensTopLeft', () => {
    const box = { left: 0, top: 100, width: 400, height: 200 };
    const lens = { width: 100, height: 100 };

    it('центрирует линзу на курсоре внутри картинки', () => {
        expect(clampLensTopLeft({ x: 200, y: 200 }, lens, box)).toEqual({ x: 150, y: 150 });
    });

    it('прижимает к левому верхнему краю картинки', () => {
        expect(clampLensTopLeft({ x: 0, y: 0 }, lens, box)).toEqual({ x: 0, y: 100 });
    });

    it('прижимает к правому нижнему краю картинки', () => {
        expect(clampLensTopLeft({ x: 1000, y: 1000 }, lens, box)).toEqual({ x: 300, y: 200 });
    });

    it('линза размером с картинку пришпилена к её углу', () => {
        const full = { width: 400, height: 200 };
        expect(clampLensTopLeft({ x: 390, y: 290 }, full, box)).toEqual({ x: 0, y: 100 });
    });
});

describe('isInsideBox', () => {
    const box = { left: 10, top: 20, width: 100, height: 50 };

    it('точка внутри', () => {
        expect(isInsideBox({ x: 50, y: 40 }, box)).toBe(true);
    });

    it('границы включительно', () => {
        expect(isInsideBox({ x: 10, y: 20 }, box)).toBe(true);
        expect(isInsideBox({ x: 110, y: 70 }, box)).toBe(true);
    });

    it('точка вне (letterbox-зона)', () => {
        expect(isInsideBox({ x: 5, y: 40 }, box)).toBe(false);
        expect(isInsideBox({ x: 50, y: 75 }, box)).toBe(false);
    });

    it('пустой box — всегда false', () => {
        expect(isInsideBox({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 0 })).toBe(false);
    });
});

describe('paneImageLayout', () => {
    const box = { left: 0, top: 100, width: 400, height: 200 };

    it('масштабирует картинку ровно в zoomFactor и сдвигает под линзу', () => {
        const layout = paneImageLayout({ x: 150, y: 150 }, box, 2);
        expect(layout).toEqual({ width: 800, height: 400, x: -300, y: -100 });
    });

    it('линза в углу картинки — нулевой сдвиг', () => {
        const layout = paneImageLayout({ x: 0, y: 100 }, box, 3);
        expect(layout).toEqual({ width: 1200, height: 600, x: -0, y: -0 });
    });

    it('фрагмент под линзой не выходит за пределы увеличенной картинки', () => {
        const lens = { width: 100, height: 100 };
        const pos = clampLensTopLeft({ x: 1000, y: 1000 }, lens, box);
        const layout = paneImageLayout(pos, box, 2);
        expect((pos.x - box.left + lens.width) * 2).toBeLessThanOrEqual(layout.width);
        expect((pos.y - box.top + lens.height) * 2).toBeLessThanOrEqual(layout.height);
    });
});
