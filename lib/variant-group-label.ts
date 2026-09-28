// Variant group names come from the legacy nopCommerce catalog (Latvian or English).
// The raw name stays the canonical key (cart line keys, stored order variantLabel);
// these translations are display-only.
type Lang = 'ru' | 'en' | 'lv'

const GROUP_LABELS: Record<string, Record<Lang, string>> = {
  'procents': { ru: 'Концентрация', en: 'Concentration', lv: 'Koncentrācija' },
  'krāsu numurs': { ru: 'Номер цвета', en: 'Shade number', lv: 'Krāsas numurs' },
  'izmērs': { ru: 'Размер', en: 'Size', lv: 'Izmērs' },
  'base': { ru: 'Основа', en: 'Base', lv: 'Bāze' },
  'tonera krāsa': { ru: 'Оттенок тонера', en: 'Toner shade', lv: 'Tonera krāsa' },
  'smarža': { ru: 'Аромат', en: 'Scent', lv: 'Smarža' },
  'washbasin': { ru: 'Раковина', en: 'Washbasin', lv: 'Izlietne' },
  'color basic': { ru: 'Цвет BASIC', en: 'Color BASIC', lv: 'Krāsa BASIC' },
  'color business': { ru: 'Цвет BUSINESS', en: 'Color BUSINESS', lv: 'Krāsa BUSINESS' },
  'color simple': { ru: 'Цвет SIMPLE', en: 'Color SIMPLE', lv: 'Krāsa SIMPLE' },
  'color exclusive': { ru: 'Цвет EXCLUSIVE', en: 'Color EXCLUSIVE', lv: 'Krāsa EXCLUSIVE' },
}

export function localizeVariantGroupName(name: string, language: string): string {
  const labels = GROUP_LABELS[name.trim().replace(/\s+/g, ' ').toLowerCase()]
  return labels?.[language as Lang] ?? name
}

/** Localizes group names inside a stored "Group: value, Group: value" label. */
export function localizeVariantLabel(label: string, language: string): string {
  return label
    .split(', ')
    .map((part) => {
      const idx = part.indexOf(': ')
      return idx > 0 ? `${localizeVariantGroupName(part.slice(0, idx), language)}${part.slice(idx)}` : part
    })
    .join(', ')
}
