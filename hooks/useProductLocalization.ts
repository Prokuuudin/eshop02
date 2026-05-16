import { useTranslation } from '@/lib/use-translation';
import { Product } from '@/data/products';

export function useProductLocalization(product: Product) {
  const { t, language } = useTranslation();
  const productBaseKey = `products.${product.id}`;

  const resolveProductValue = (productKey: string, fallbackKey: string): string => {
    const value = t(productKey);
    return value === productKey ? t(fallbackKey) : value;
  };

  const localizedTitle =
    language === 'en' && product.titleEn
      ? product.titleEn
      : language === 'lv' && product.titleLv
      ? product.titleLv
      : t(product.titleKey ?? `products.${product.id}.title`, product.title);

  const productDescription = resolveProductValue(
    `${productBaseKey}.description`,
    'product.descriptionText'
  );
  const productSpecVolume = resolveProductValue(
    `${productBaseKey}.spec.volume`,
    'product.spec.value.volume'
  );
  const productSpecType = resolveProductValue(
    `${productBaseKey}.spec.type`,
    'product.spec.value.type'
  );
  const productSpecCountry = resolveProductValue(
    `${productBaseKey}.spec.country`,
    'product.spec.value.country'
  );
  const productFeatures = [1, 2, 3, 4].map((index) =>
    t(
      `${productBaseKey}.feature${index}`,
      t(
        `product.feature${index}`,
        index === 1
          ? 'Natural components'
          : index === 2
          ? 'Paraben-free'
          : index === 3
          ? 'Dermatologically tested'
          : 'Suitable for all skin types'
      )
    )
  );

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
