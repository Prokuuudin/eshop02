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
    return fromI18n !== `${productBaseKey}.description` ? fromI18n : t('product.descriptionText');
  })();

  const productSpecVolume = (() => {
    if (product.specVolume) return product.specVolume;
    const fromI18n = t(`${productBaseKey}.spec.volume`);
    return fromI18n !== `${productBaseKey}.spec.volume` ? fromI18n : t('product.spec.value.volume');
  })();

  const productSpecType = (() => {
    if (product.specType) return product.specType;
    const fromI18n = t(`${productBaseKey}.spec.type`);
    return fromI18n !== `${productBaseKey}.spec.type` ? fromI18n : t('product.spec.value.type');
  })();

  const productSpecCountry = (() => {
    if (product.specCountry) return product.specCountry;
    const fromI18n = t(`${productBaseKey}.spec.country`);
    return fromI18n !== `${productBaseKey}.spec.country` ? fromI18n : t('product.spec.value.country');
  })();

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
    productSpecVolume,
    productSpecType,
    productSpecCountry,
    productFeatures,
  };
}
