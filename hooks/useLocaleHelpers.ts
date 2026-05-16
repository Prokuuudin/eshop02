import { useTranslation } from '@/lib/use-translation';
import { l, tl as tlHelper } from '@/utils/localeHelpers';

export function useLocaleHelpers() {
    const { t, language } = useTranslation();
    const tl = tlHelper(t, language);
    return { t, language, l: (ru: string, en: string, lv: string) => l(language, ru, en, lv), tl };
}
