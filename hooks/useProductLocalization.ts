import { useTranslation } from '@/lib/use-translation';
import { Product } from '@/data/products';

export function useProductLocalization(product: Product) {
  const { t, language } = useTranslation();
  const productBaseKey = `products.${product.id}`;

  const localizedTitle =
    language === 'en' && product.titleEn
      ? product.titleEn
      : language === 'lv' && product.titleLv
      ? product.titleLv
      : t(product.titleKey ?? `products.${product.id}.title`, product.title);

  const productDescription = (() => {
    // technicalSpecs.__descriptionEn/__descriptionLv hold the translated description —
    // reserved-key convention (like __variantGroupsJson), no separate schema column.
    const localized =
      language === 'en'
        ? product.technicalSpecs?.__descriptionEn
        : language === 'lv'
        ? product.technicalSpecs?.__descriptionLv
        : undefined;
    if (localized) return localized;
    if (product.description) return product.description;
    const fromI18n = t(`${productBaseKey}.description`);
    return fromI18n !== `${productBaseKey}.description` ? fromI18n : '';
  })();

  // Применение и предостережения колонок в БД не имеют — весь контент живёт в
  // резервных __-ключах technicalSpecs: RU в базовом ключе, переводы в *En/*Lv.
  const localizedReserved = (base: string): string => {
    const specs = product.technicalSpecs ?? {};
    const translated =
      language === 'en' ? specs[`${base}En`] : language === 'lv' ? specs[`${base}Lv`] : undefined;
    return translated || specs[base] || '';
  };

  const productApplication = localizedReserved('__application');
  const productWarnings = localizedReserved('__warnings');

  const productFeatures = [1, 2, 3, 4]
    .map((index) => {
      const featureKey = `feature${index}` as keyof Product;
      const featureEnKey = `feature${index}En` as keyof Product;
      const featureLvKey = `feature${index}Lv` as keyof Product;

      return language === 'en'
        ? (product[featureEnKey] as string | undefined) || (product[featureKey] as string | undefined)
        : language === 'lv'
        ? (product[featureLvKey] as string | undefined) || (product[featureKey] as string | undefined)
        : (product[featureKey] as string | undefined);
    })
    .filter((value): value is string => Boolean(value));

  return {
    t,
    language,
    localizedTitle,
    productDescription,
    productApplication,
    productWarnings,
    productFeatures,
  };
}
