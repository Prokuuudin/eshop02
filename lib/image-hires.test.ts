import { describe, expect, it } from 'vitest';
import { deriveHiResSrc } from './image-hires';

describe('deriveHiResSrc', () => {
    it('срезает размерный суффикс _400 у jpeg', () => {
        expect(
            deriveHiResSrc('https://hairshop.lv/content/images/thumbs/0029633_matrix-porook-500-g-bleaching-_400.jpeg'),
        ).toBe('https://hairshop.lv/content/images/thumbs/0029633_matrix-porook-500-g-bleaching-.jpeg');
    });

    it('работает для png и других расширений', () => {
        expect(
            deriveHiResSrc('https://hairshop.lv/content/images/thumbs/0029626_spray_400.png'),
        ).toBe('https://hairshop.lv/content/images/thumbs/0029626_spray.png');
    });

    it('URL без размерного суффикса — уже оригинал, hi-res не нужен', () => {
        expect(
            deriveHiResSrc('https://hairshop.lv/content/images/thumbs/0029454_dreame-dazzle-fens.jpeg'),
        ).toBeUndefined();
    });

    it('цифры в имени товара (150ml и т.п., через дефис) не принимаются за суффикс', () => {
        expect(
            deriveHiResSrc('https://hairshop.lv/content/images/thumbs/0029598_subrina-krems-150.jpeg'),
        ).toBeUndefined();
        expect(
            deriveHiResSrc('https://hairshop.lv/content/images/thumbs/0029598_subrina-smooth-cream-150-ml.jpeg'),
        ).toBeUndefined();
    });

    it('не-thumb URL не трогает', () => {
        expect(deriveHiResSrc('https://example.com/photo_400.jpeg')).toBeUndefined();
        expect(deriveHiResSrc('/uploads/local_400.png')).toBeUndefined();
    });
});
