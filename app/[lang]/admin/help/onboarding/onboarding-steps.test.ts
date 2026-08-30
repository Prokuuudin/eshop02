import { describe, expect, it } from 'vitest';
import { getOnboardingSteps } from './onboarding-steps';

describe('getOnboardingSteps', () => {
    it('keeps the same checklist structure for every language', () => {
        const ru = getOnboardingSteps('ru');

        for (const language of ['en', 'lv'] as const) {
            const localized = getOnboardingSteps(language);
            expect(localized).toHaveLength(ru.length);
            expect(localized.map(({ id, group, href }) => ({ id, group, href }))).toEqual(
                ru.map(({ id, group, href }) => ({ id, group, href }))
            );
            expect(localized.every((step) => step.text.length > 0)).toBe(true);
        }
    });
});
