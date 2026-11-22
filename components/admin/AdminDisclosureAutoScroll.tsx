'use client';

import { useEffect } from 'react';

const ROOT_SELECTOR = '[data-admin-disclosure-root]';
const OPT_OUT_SELECTOR = '[data-disclosure-autoscroll="off"]';

/** A trigger inside a sticky/fixed bar (e.g. a mobile action menu) must not move the page. */
function hasPinnedAncestor(el: HTMLElement, root: Element): boolean {
    for (let node: HTMLElement | null = el; node && node !== root; node = node.parentElement) {
        const position = getComputedStyle(node).position;
        if (position === 'sticky' || position === 'fixed') return true;
    }
    return false;
}

function isExpanded(trigger: HTMLElement): boolean {
    if (trigger.tagName === 'SUMMARY') {
        const details = trigger.parentElement;
        return details instanceof HTMLDetailsElement && details.open;
    }
    return trigger.getAttribute('aria-expanded') === 'true';
}

/**
 * When the user expands any disclosure block in the admin content area
 * (<details>/<summary>, Radix Accordion/Collapsible, custom aria-expanded buttons),
 * scroll the block to just below the sticky header so the revealed content is in view.
 * Only user clicks trigger it; programmatic opens keep their own scrolling.
 */
export default function AdminDisclosureAutoScroll(): null {
    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (!(event.target instanceof Element)) return;

            const trigger = event.target.closest<HTMLElement>('summary, button[aria-expanded]');
            if (!trigger) return;
            const root = trigger.closest(ROOT_SELECTOR);
            if (!root) return;
            if (trigger.closest(OPT_OUT_SELECTOR) || trigger.closest('[role="dialog"]')) return;
            // Dropdown/select/combobox triggers also carry aria-expanded — they are popups, not blocks.
            if (trigger.hasAttribute('aria-haspopup') || trigger.getAttribute('role') === 'combobox') return;
            if (hasPinnedAncestor(trigger, root)) return;

            // The native <details> toggle and React's discrete-event commit both finish right after
            // dispatch; a macrotask is enough (rAF can stall when no frame is pending).
            window.setTimeout(() => {
                if (!trigger.isConnected || !isExpanded(trigger)) return;
                const block = trigger.tagName === 'SUMMARY' ? (trigger.parentElement ?? trigger) : trigger;
                // Sticky header height varies (nav wraps on narrow viewports) — measure it.
                const headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
                const targetTop = window.scrollY + block.getBoundingClientRect().top - headerHeight - 12;
                window.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' });
            }, 0);
        };

        document.addEventListener('click', onClick);
        return () => document.removeEventListener('click', onClick);
    }, []);

    return null;
}
