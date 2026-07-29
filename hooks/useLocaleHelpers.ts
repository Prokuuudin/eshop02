import { useTranslation } from '@/lib/use-translation';
import { l, tl as tlHelper } from '@/utils/localeHelpers';

type LocaleHelpers = Pick<ReturnType<typeof useTranslation>, 't' | 'language'> & {
    l: (ru: string, en: string, lv: string) => string;
    tl: ReturnType<typeof tlHelper>;
};

export function useLocaleHelpers(): LocaleHelpers {
    const { t, language } = useTranslation();
    const tl = tlHelper(t, language);
    return { t, language, l: (ru: string, en: string, lv: string) => l(language, ru, en, lv), tl };
}
