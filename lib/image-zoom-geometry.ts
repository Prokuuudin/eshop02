// Чистая геометрия hover-zoom'а превью товара: вынесена из хука useImageZoom,
// чтобы letterbox/clamping-математику можно было гонять юнит-тестами без DOM.

export interface Size {
    width: number;
    height: number;
}

export interface Point {
    x: number;
    y: number;
}

export interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), Math.max(max, min));

/**
 * Прямоугольник фактически отрисованной картинки при object-contain внутри
 * контейнера с внутренним отступом padding (letterbox по одной из осей).
 * Координаты — относительно левого верхнего угла контейнера.
 */
export function computeContainBox(container: Size, natural: Size, padding = 0): Box {
    const availWidth = Math.max(0, container.width - padding * 2);
    const availHeight = Math.max(0, container.height - padding * 2);
    if (availWidth <= 0 || availHeight <= 0 || natural.width <= 0 || natural.height <= 0) {
        return { left: container.width / 2, top: container.height / 2, width: 0, height: 0 };
    }
    const scale = Math.min(availWidth / natural.width, availHeight / natural.height);
    const width = natural.width * scale;
    const height = natural.height * scale;
    return {
        left: padding + (availWidth - width) / 2,
        top: padding + (availHeight - height) / 2,
        width,
        height,
    };
}

/**
 * Размер линзы: область превью, которая после увеличения ровно заполнит панель.
 * Никогда не больше самой картинки (маленькое фото + большая панель).
 */
export function lensSizeFor(imageBox: Size, pane: Size, zoomFactor: number): Size {
    const zoom = Math.max(zoomFactor, 1);
    return {
        width: Math.min(pane.width / zoom, imageBox.width),
        height: Math.min(pane.height / zoom, imageBox.height),
    };
}

/** Левый верхний угол линзы: центрируем на курсоре, но не выпускаем за границы картинки. */
export function clampLensTopLeft(cursor: Point, lens: Size, imageBox: Box): Point {
    return {
        x: clamp(cursor.x - lens.width / 2, imageBox.left, imageBox.left + imageBox.width - lens.width),
        y: clamp(cursor.y - lens.height / 2, imageBox.top, imageBox.top + imageBox.height - lens.height),
    };
}

export function isInsideBox(point: Point, box: Box): boolean {
    return (
        box.width > 0 &&
        box.height > 0 &&
        point.x >= box.left &&
        point.x <= box.left + box.width &&
        point.y >= box.top &&
        point.y <= box.top + box.height
    );
}

/**
 * Размер и сдвиг увеличенной картинки внутри панели: масштаб всегда ровно
 * zoomFactor (без растяжения по осям), сдвиг — чтобы область под линзой
 * оказалась в левом верхнем углу панели.
 */
export function paneImageLayout(
    lensTopLeft: Point,
    imageBox: Box,
    zoomFactor: number,
): { width: number; height: number; x: number; y: number } {
    const zoom = Math.max(zoomFactor, 1);
    return {
        width: imageBox.width * zoom,
        height: imageBox.height * zoom,
        x: -(lensTopLeft.x - imageBox.left) * zoom,
        y: -(lensTopLeft.y - imageBox.top) * zoom,
    };
}
