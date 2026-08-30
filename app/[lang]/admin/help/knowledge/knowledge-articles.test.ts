import { describe, expect, it } from 'vitest';
import { getKnowledgeArticles } from './knowledge-articles';

describe('knowledge articles', () => {
    it('keeps every locale aligned with the base article list', () => {
        const ru = getKnowledgeArticles('ru');
        const en = getKnowledgeArticles('en');
        const lv = getKnowledgeArticles('lv');

        expect(en).toHaveLength(ru.length);
        expect(lv).toHaveLength(ru.length);
        expect(ru.length).toBeGreaterThan(0);
        expect(en.every((article) => article.title && article.description && article.linkLabel)).toBe(true);
        expect(lv.every((article) => article.title && article.description && article.linkLabel)).toBe(true);
        expect(en.map((article) => article.href)).toEqual(ru.map((article) => article.href));
        expect(lv.map((article) => article.href)).toEqual(ru.map((article) => article.href));
    });
});

