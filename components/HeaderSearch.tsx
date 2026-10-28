import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/use-translation';
import { localizePath } from '@/lib/i18n-routing';
import { normalizeSearchText, SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH } from '@/lib/product-search';
import { IconSearch } from './ui/icon-search';

type Suggestion = {
  id: string;
  title: string;
  brand: string;
  sku?: string;
  image?: string;
};

type LookupState = { query: string; status: 'loading' | 'done'; items: Suggestion[] };

const SUGGESTION_LIMIT = 6;
const DEBOUNCE_MS = 250;

export default function HeaderSearch(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { t, language } = useTranslation();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();
  const searchable = normalizeSearchText(trimmed).length >= SEARCH_MIN_LENGTH;
  // Results only ever describe the query they were fetched for: a late answer to an older
  // query is never shown under a newer one.
  const current = searchable && lookup?.query === trimmed ? lookup : null;
  const suggestions = current?.status === 'done' ? current.items : [];

  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLookup({ query: trimmed, status: 'loading', items: [] });
      const params = new URLSearchParams({ q: trimmed, take: String(SUGGESTION_LIMIT), lang: language });
      fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
        .then((response) => response.json() as Promise<{ products?: Suggestion[] }>)
        .then((payload) => setLookup({ query: trimmed, status: 'done', items: payload.products ?? [] }))
        .catch((error: unknown) => {
          if ((error as { name?: string })?.name !== 'AbortError') setLookup({ query: trimmed, status: 'done', items: [] });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, searchable, language]);

  // Close on any pointer press outside the search box (the options themselves are inside it).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const listboxId = 'header-search-suggestions';
  const inputId = 'site-search';
  const showPanel = open && Boolean(current);

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const openResults = () => {
    if (!trimmed) return;
    close();
    router.push(localizePath(`/catalog?search=${encodeURIComponent(trimmed)}`, language));
  };

  const openProduct = (suggestion: Suggestion) => {
    close();
    setQuery('');
    router.push(localizePath(`/product/${encodeURIComponent(suggestion.id)}`, language));
  };

  const highlightText = (text: string): React.ReactNode => {
    const needle = trimmed.toLowerCase();
    const index = needle ? text.toLowerCase().indexOf(needle) : -1;
    if (index === -1) return text;
    return (
      <>
        {text.slice(0, index)}
        <mark className="bg-yellow-200 dark:bg-yellow-700 rounded px-0.5">{text.slice(index, index + needle.length)}</mark>
        {text.slice(index + needle.length)}
      </>
    );
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showPanel && activeIndex >= 0 && suggestions[activeIndex]) openProduct(suggestions[activeIndex]);
      else openResults();
      return;
    }
    if (!showPanel || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    }
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); openResults(); }}
      className="header__search max-w-xl mx-auto flex gap-2 items-center"
      role="search"
    >
      <label htmlFor={inputId} className="sr-only">{t('nav.search')}</label>
      <div ref={containerRef} className="relative flex-1">
        <input
          id={inputId}
          type="search"
          className="w-full rounded-md border border-border bg-card text-foreground placeholder:text-gray-500 dark:placeholder:text-gray-300 px-3 py-2 text-base md:text-sm"
          placeholder={t('catalog.searchPlaceholder')}
          value={query}
          maxLength={SEARCH_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={showPanel && suggestions.length > 0}
          aria-activedescendant={showPanel && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onKeyDown={handleInputKeyDown}
          onFocus={() => setOpen(true)}
        />

        {showPanel && (
          <div className="ui-disclosure-in absolute left-0 right-0 top-full mt-1 z-30 bg-card border border-border rounded-md shadow-lg overflow-hidden">
            {current?.status === 'loading' && suggestions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground" aria-live="polite">{t('search.loading')}</p>
            ) : suggestions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground" aria-live="polite">
                {t('catalog.noResultsForQuery', 'Nothing found for your query "{query}"', { query: trimmed })}
              </p>
            ) : (
              <>
                <ul id={listboxId} role="listbox" className="max-h-[min(60vh,24rem)] overflow-y-auto overscroll-contain">
                  {suggestions.map((suggestion, index) => (
                    <li key={suggestion.id}>
                      <button
                        id={`${listboxId}-option-${index}`}
                        type="button"
                        role="option"
                        aria-selected={activeIndex === index}
                        // Keep focus in the input: a press must not blur before the click lands.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => openProduct(suggestion)}
                        // Only real pointer movement highlights: a list that opens under a resting
                        // cursor must not turn the next Enter into "open this product".
                        onMouseMove={() => { if (activeIndex !== index) setActiveIndex(index); }}
                        className={`flex w-full items-center gap-3 text-left px-3 py-2 hover:bg-muted ${activeIndex === index ? 'bg-muted' : ''}`}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-white">
                          {suggestion.image ? (
                            // eslint-disable-next-line @next/next/no-img-element -- 40px thumbnail from the existing remote product image
                            <img src={suggestion.image} alt="" loading="lazy" className="h-full w-full object-contain" />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">{highlightText(suggestion.title)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {highlightText(suggestion.brand)}
                            {suggestion.sku ? <> · {t('search.skuLabel')} {highlightText(suggestion.sku)}</> : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={openResults}
                  className="block w-full border-t border-border px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
                >
                  {t('search.showAll')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <button
        type="submit"
        aria-label={t('catalog.search')}
        className="rounded px-3 py-2 text-sm font-medium bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 flex items-center gap-2 transition-colors flex-shrink-0"
      >
        <IconSearch className="w-5 h-5 text-white dark:text-black" aria-hidden="true" />
        <span className="hidden sm:inline">{t('catalog.search')}</span>
      </button>
    </form>
  );
}
