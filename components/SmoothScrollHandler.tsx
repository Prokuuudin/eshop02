"use client";
import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function SmoothScrollHandler(): null {
  const pathname = usePathname();
  const router = useRouter();
  const pendingHashRef = useRef<string | null>(null);
  const scrollTokenRef = useRef(0);

  const normalizeHash = useCallback((hash: string): string => {
    if (!hash) return '';
    return hash.startsWith('#') ? hash : `#${hash}`;
  }, []);

  const getHeaderOffset = useCallback((): number => {
    const value = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue('--header-offset')
      .trim();

    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }

    const header = document.querySelector('header.header') as HTMLElement | null;
    return (header?.offsetHeight ?? 0) + 8;
  }, []);

  const tryScrollToHash = useCallback((
    hash: string,
    behavior: ScrollBehavior,
    token: number,
    attempt = 0
  ): boolean => {
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    if (!id) return false;

    const el = document.getElementById(id);
    if (!el) {
      if (attempt < 40 && token === scrollTokenRef.current) {
        window.setTimeout(() => {
          tryScrollToHash(hash, behavior, token, attempt + 1);
        }, 80);
      }
      return false;
    }

    const targetTop = Math.max(el.getBoundingClientRect().top + window.scrollY - getHeaderOffset(), 0);
    window.scrollTo({ top: targetTop, behavior });

    if (behavior === 'smooth') {
      [500, 1000].forEach((delay) => {
        window.setTimeout(() => {
          if (token !== scrollTokenRef.current) return;
          const latestEl = document.getElementById(id);
          if (!latestEl) return;
          const correctedTop = Math.max(
            latestEl.getBoundingClientRect().top + window.scrollY - getHeaderOffset(),
            0
          );
          if (Math.abs(window.scrollY - correctedTop) > 2) {
            window.scrollTo({ top: correctedTop, behavior: 'auto' });
          }
        }, delay);
      });
    }

    return true;
  }, [getHeaderOffset]);

  const scheduleScrollToHash = useCallback((hash: string, behavior: ScrollBehavior = 'smooth') => {
    const normalized = normalizeHash(hash);
    if (!normalized) return;
    scrollTokenRef.current += 1;
    const token = scrollTokenRef.current;
    tryScrollToHash(normalized, behavior, token, 0);
  }, [normalizeHash, tryScrollToHash]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target?.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      if (href.startsWith('#')) {
        e.preventDefault();

        if (window.location.hash !== href) {
          window.history.pushState(null, '', href);
        }

        scheduleScrollToHash(href, 'smooth');
        return;
      }

      if (href.startsWith('/#')) {
        e.preventDefault();
        const hash = normalizeHash(href.slice(1));

        if (window.location.pathname === '/') {
          if (window.location.hash !== hash) {
            window.history.pushState(null, '', hash);
          }
          scheduleScrollToHash(hash, 'smooth');
          return;
        }

        pendingHashRef.current = hash;
        router.push('/');
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [normalizeHash, router, scheduleScrollToHash]);

  useEffect(() => {
    if (pathname !== '/') return;

    const hashToScroll = pendingHashRef.current ?? window.location.hash;
    if (!hashToScroll) return;

    if (pendingHashRef.current && window.location.hash !== pendingHashRef.current) {
      window.history.replaceState(null, '', pendingHashRef.current);
    }

    pendingHashRef.current = null;

    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        scheduleScrollToHash(hashToScroll, 'smooth');
      });
      return () => cancelAnimationFrame(raf2);
    });

    return () => cancelAnimationFrame(raf1);
  }, [pathname, scheduleScrollToHash]);

  useEffect(() => {
    const handleHashChange = () => {
      if (!window.location.hash) return;
      scheduleScrollToHash(window.location.hash, 'smooth');
    };

    const handleLoad = () => {
      if (!window.location.hash) return;
      scheduleScrollToHash(window.location.hash, 'smooth');
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('load', handleLoad);

    if (document.readyState === 'complete' && window.location.hash) {
      scheduleScrollToHash(window.location.hash, 'smooth');
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('load', handleLoad);
    };
  }, [scheduleScrollToHash]);

  return null;
}