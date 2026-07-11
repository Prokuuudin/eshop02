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

  // Пустая строка = данных нет, строка в блоке «Характеристики» не рендерится.
  // Никаких выдуманных дефолтов ('50-300ml' / 'Швейцария' и т.п.) — только
  // реальное поле из БД или точечный i18n-ключ товара.
  // EN/LV-переводы кратких характеристик живут в technicalSpecs.__spec*En/Lv
  // (резервные ключи, как __descriptionEn); пустой перевод — фолбэк на RU-колонку.
  const localizedSpec = (ruValue: string | undefined, reservedBase: string, i18nSuffix: string): string => {
    const reserved =
      language === 'en'
        ? product.technicalSpecs?.[`${reservedBase}En`]
        : language === 'lv'
        ? product.technicalSpecs?.[`${reservedBase}Lv`]
        : undefined;
    if (reserved) return reserved;
    if (ruValue) return ruValue;
    const fromI18n = t(`${productBaseKey}.spec.${i18nSuffix}`);
    return fromI18n !== `${productBaseKey}.spec.${i18nSuffix}` ? fromI18n : '';
  };

  const productSpecVolume = localizedSpec(product.specVolume, '__specVolume', 'volume');
  const productSpecType = localizedSpec(product.specType, '__specType', 'type');
  const productSpecCountry = localizedSpec(product.specCountry, '__specCountry', 'country');

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

  const productPurpose =
    (language === 'en'
      ? product.purposeEn
      : language === 'lv'
      ? product.purposeLv
      : undefined) ||
    product.purpose ||
    '';

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
    productPurpose,
    productApplication,
    productWarnings,
    productFeatures,
  };
}
