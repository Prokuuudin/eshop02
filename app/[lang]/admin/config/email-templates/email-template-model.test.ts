import { describe, expect, it } from 'vitest';
import { guideFor, renderPreview } from './email-template-model';

describe('email template model', () => {
    it('classifies localized order templates', () => {
        expect(guideFor('order-confirmation-en')).toMatchObject({ category: 'orders', language: 'EN' });
        expect(guideFor('password-reset-lv')).toMatchObject({ category: 'security', language: 'LV' });
    });

    it('substitutes declared preview variables and leaves undeclared ones untouched', () => {
        const preview = renderPreview(
            '<p>{{first_name}} {{order_id}} {{custom}}</p>',
            ['first_name', 'order_id'],
            'en'
        );

        expect(preview).toBe('<p>John ORD-2026-001 {{custom}}</p>');
    });

    it('marks unknown declared variables visibly', () => {
        expect(renderPreview('{{unknown}}', ['unknown'], 'ru')).toBe('[unknown]');
    });
});
