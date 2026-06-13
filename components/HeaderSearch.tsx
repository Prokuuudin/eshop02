import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/use-translation';
import { PRODUCTS } from '@/data/products';
import { getAutocompleteSuggestions } from '@/lib/search';
import { IconSearch } from './ui/icon-search';
import type { Product } from '@/data/products';
import { translations } from '@/data/translations';

export default function HeaderSearch() {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { t, language } = useTranslation();
  const router = useRouter();
  const localizeTitle = useMemo(() => (product: Product) =>
    (language === 'en' && product.titleEn)
      ? product.titleEn
      : (language === 'lv' && product.titleLv)
        ? product.titleLv
        : t(product.titleKey ?? `products.${product.id}.title`, product.title),
    [t, language]
  );

  // Products with all 3 language titles concatenated for cross-language search
  const searchableProducts = useMemo(
    () => PRODUCTS.map((product) => {
      const key = product.titleKey ?? `products.${product.id}.title`
      const allTitles = [
        product.title,
        translations.ru[key],
        translations.en[key],
        translations.lv[key],
      ].filter((v): v is string => typeof v === 'string' && v.length > 0)
       .filter((v, i, arr) => arr.indexOf(v) === i)
       .join(' ')
      return { ...product, title: allTitles, titleEn: undefined, titleLv: undefined }
    }),
    []
  );

  const rawSuggestions = useMemo(
    () => getAutocompleteSuggestions(searchableProducts, query, 5),
    [searchableProducts, query]
  );

  // Map back to localized display title
  const suggestions = useMemo(
    () => rawSuggestions.map((p) => {
      const orig = PRODUCTS.find((o) => o.id === p.id) ?? p
      return { ...orig, title: localizeTitle(orig) }
    }),
    [rawSuggestions, localizeTitle]
  );
  const listboxId = 'header-search-suggestions';
  const inputId = 'site-search';

  const highlightText = (text: string, searchValue: string): React.ReactNode => {
    const needle = searchValue.trim();
    if (!needle) return text;

    const lowerText = text.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    const index = lowerText.indexOf(lowerNeedle);

    if (index === -1) return text;

    const before = text.slice(0, index);
    const match = text.slice(index, index + needle.length);
    const after = text.slice(index + needle.length);

    return (
      <>
        {before}
        <mark className="bg-yellow-200 dark:bg-yellow-700 rounded px-0.5">{match}</mark>
        {after}
      </>
    );
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/catalog?search=${encodeURIComponent(query)}`);
      setQuery('');
    }
  };

  const handleSuggestionClick = (value: string) => {
    setQuery('');
    setFocused(false);
    setActiveIndex(-1);
    router.push(`/catalog?search=${encodeURIComponent(value)}`);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!focused || suggestions.length === 0) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
      return;
    }

    if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSuggestionClick(suggestions[activeIndex].title);
      return;
    }

    if (e.key === 'Escape') {
      setFocused(false);
      setActiveIndex(-1);
    }
  };

  return (
    <form onSubmit={handleSearch} className="header__search max-w-xl mx-auto flex gap-2 items-center">
      <label htmlFor="site-search" className="sr-only">{t('nav.search')}</label>
      <div className="relative flex-1">
        <input
          id={inputId}
          className="w-full rounded-md border border-border bg-white dark:bg-gray-800 text-foreground placeholder:text-gray-500 dark:placeholder:text-gray-300 px-3 py-2 text-sm"
          placeholder={t('catalog.searchPlaceholder')}
          value={query}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={focused && query.trim().length > 0 && suggestions.length > 0}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          onChange={e => {
            setQuery(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleInputKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => {
            setFocused(false);
            setActiveIndex(-1);
          }, 120)}
        />

        {focused && query.trim() && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-card border border-border rounded-md shadow-lg overflow-hidden">
            <ul id={listboxId} role="listbox" className="max-h-72 overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <li key={suggestion.id}>
                  <button
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    onClick={() => handleSuggestionClick(suggestion.title)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`w-full text-left px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      activeIndex === index ? 'bg-gray-50 dark:bg-gray-800' : ''
                    }`}
                  >
                    <p className="text-sm text-foreground">{highlightText(suggestion.title, query)}</p>
                    <p className="text-xs text-muted-foreground">{highlightText(suggestion.brand, query)}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <button
        type="submit"
        className="rounded px-3 py-2 text-sm font-medium bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 flex items-center gap-2 transition-colors flex-shrink-0"
      >
        <IconSearch className="w-5 h-5 text-white dark:text-black" aria-hidden="true" />
        <span className="hidden sm:inline">{t('catalog.search')}</span>
      </button>
    </form>
  );
}
