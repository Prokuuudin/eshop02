export function l(language: string, ru: string, en: string, lv: string) {
    return language === 'ru' ? ru : language === 'lv' ? lv : en;
}

export function tl(t: (key: string, fallback: string, params?: Record<string, string | number>) => string, language: string) {
    return (key: string, ru: string, en: string, lv: string, params?: Record<string, string | number>) =>
        t(key, l(language, ru, en, lv), params);
}
