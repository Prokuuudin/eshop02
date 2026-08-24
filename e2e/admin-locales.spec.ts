import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN, loginAs } from './helpers';

type Locale = 'ru' | 'en' | 'lv';

test.setTimeout(180_000);

const localeCases: Record<Locale, Array<{ path: string; heading: string }>> = {
    ru: [
        { path: '/admin/import', heading: 'Импорт и обновление каталога' },
        { path: '/admin/help/knowledge', heading: 'База знаний' },
        { path: '/admin/help/onboarding', heading: 'Онбординг сотрудника' },
        { path: '/admin/design-system', heading: 'Дизайн-система' },
        { path: '/admin/reviews', heading: 'Отзывы: модерация' },
        { path: '/admin/contact-messages', heading: 'Запросы покупателей' },
    ],
    en: [
        { path: '/admin/import', heading: 'Catalog import and update' },
        { path: '/admin/help/knowledge', heading: 'Knowledge base' },
        { path: '/admin/help/onboarding', heading: 'Employee onboarding' },
        { path: '/admin/design-system', heading: 'Design system' },
        { path: '/admin/reviews', heading: 'Reviews: moderation' },
        { path: '/admin/contact-messages', heading: 'Customer requests' },
    ],
    lv: [
        { path: '/admin/import', heading: 'Kataloga imports un atjaunināšana' },
        { path: '/admin/help/knowledge', heading: 'Zināšanu bāze' },
        { path: '/admin/help/onboarding', heading: 'Darbinieka ievadīšana darbā' },
        { path: '/admin/design-system', heading: 'Dizaina sistēma' },
        { path: '/admin/reviews', heading: 'Atsauksmju moderēšana' },
        { path: '/admin/contact-messages', heading: 'Klientu pieprasījumi' },
    ],
};

const seedAdminSession = async (page: Page): Promise<void> => {
    await page.addInitScript((adminUser) => {
        window.localStorage.setItem('eshop_users', JSON.stringify([adminUser]));
        window.localStorage.setItem('eshop_current_user', JSON.stringify(adminUser));
    }, E2E_ADMIN);
};

for (const locale of Object.keys(localeCases) as Locale[]) {
    test(`key admin routes render correctly in ${locale}`, async ({ page }) => {
        await loginAs(page, E2E_ADMIN);
        await seedAdminSession(page);

        const pageErrors: string[] = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));

        for (const route of localeCases[locale]) {
            await page.goto(`/${locale}${route.path}`);
            await expect(page.locator('html')).toHaveAttribute('lang', locale);
            await expect(
                page.getByRole('heading', { level: 1, name: route.heading })
            ).toBeVisible();
            await expect
                .poll(() =>
                    page.evaluate(
                        () => document.documentElement.scrollWidth <= window.innerWidth + 1
                    )
                )
                .toBe(true);
        }

        expect(pageErrors).toEqual([]);
    });
}
