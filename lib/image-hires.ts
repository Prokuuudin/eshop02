// nopCommerce-миниатюры hairshop.lv: суффикс _NNN перед расширением — размер
// тумбы (в каталоге в основном _400). Файл без суффикса в том же каталоге —
// полноразмерный оригинал (проверено на выборке: 500–1559px против 400).
const THUMB_WITH_SIZE_RE =
    /^(https?:\/\/[^?#]*\/content\/images\/thumbs\/[^?#]*)_\d{2,4}(\.(?:jpe?g|png|webp|gif))$/i;

/**
 * Полноразмерный вариант для thumb-URL nopCommerce, если он выводим из самого
 * URL. Наличие файла на сервере не гарантировано — потребитель обязан иметь
 * onError-fallback на исходный src.
 */
export function deriveHiResSrc(src: string): string | undefined {
    const match = THUMB_WITH_SIZE_RE.exec(src);
    return match ? `${match[1]}${match[2]}` : undefined;
}
