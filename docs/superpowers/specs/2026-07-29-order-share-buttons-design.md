# Order Share Buttons — Design

## Context

On the order confirmation page (`app/[lang]/order/[id]/page.tsx`), the sidebar has two invoice download buttons (`order.downloadInvoice` for LV, `order.downloadInvoiceEn` for EN, lines 688-689). The request: add a "share" affordance next to them so a customer can pass the order along via email or messengers.

## Constraint discovered during scoping

`handleDownloadInvoice` builds the invoice HTML client-side and downloads it via a `Blob`/`URL.createObjectURL` (revoked after 10s, tab-local). That URL cannot be emailed or messaged — it wouldn't resolve for the recipient. `mailto:`/`wa.me:` links also cannot carry a file attachment; only the Web Share API (level 2, `navigator.share({ files })`) can hand a real file to another app. The design below accounts for this instead of promising a link that can't work.

## UI

- New component `components/ShareOrderButton.tsx`, placed next to the two invoice buttons in the order sidebar.
- Single icon-only button, `variant="outline" size="icon"`, `lucide-react` `Share2` icon, no text.
- Wrapped in the existing `Tooltip`/`TooltipProvider`/`TooltipTrigger`/`TooltipContent` pattern (see `components/ThemeToggle.tsx`), localized hint via `t('order.share')`.

## Behavior on click

1. Build `shareText` from `t('order.shareText', ...)` — store name, order number, total (e.g. "hairshoppro.lv — заказ №1234, сумма 45,90 €"), localized per `ru`/`en`/`lv`.
2. Rebuild the invoice as a `File` (same `buildInvoiceHtml`/`fetchInvoiceTitles` call already used by `handleDownloadInvoice`), not a revoked blob URL.
3. If `navigator.canShare?.({ files: [file] })` is true: call `navigator.share({ files: [file], text: shareText, title: shareText })`. The OS share sheet lists whatever apps the user has (Gmail, WhatsApp, Telegram, etc.) with the real invoice file attached.
4. Else if `navigator.share` exists (no file support): call `navigator.share({ text: shareText, title: shareText })` — text only, no attachment.
5. Else (no Web Share API at all, e.g. Firefox desktop): open a `DropdownMenu` (existing `components/ui/dropdown-menu.tsx`, pattern from `ProductFilter.tsx`) with 3 icon-only items, each with its own tooltip:
   - Email — lucide `Mail` — `mailto:?subject=<shareText>&body=<shareText>`
   - WhatsApp — lucide `MessageCircle` — `https://wa.me/?text=<shareText>`
   - Telegram — lucide `Send` — `https://t.me/share/url?url=&text=<shareText>`
   All three are text-only (no attachment) — documented limitation, not a bug.

No brand SVGs for WhatsApp/Telegram; neutral lucide icons only, matching the rest of the site's icon treatment (`currentColor`).

## i18n

New keys in `data/translations.ts`, added to all three language blocks (ru/en/lv), following the existing `order.downloadInvoice` pattern:
- `order.share` — tooltip on the main button
- `order.shareText` — templated body text (order number / total / store name placeholders)
- `order.shareEmail`, `order.shareWhatsapp`, `order.shareTelegram` — tooltips for the fallback dropdown items

## Out of scope

- No backend endpoint, no public/token-based invoice link, no DB schema change — this stays entirely client-side.
- No custom brand iconography for messenger fallback buttons.
- Sharing the order page URL is not part of this feature (page is access-gated to the order owner/admin; a shared link would 404 for anyone else).

## Testing

- Manual verification per `verify` skill: open an existing order at `/[lang]/order/[id]`, confirm the share button renders with tooltip, confirm behavior on a browser with `navigator.share` mocked/present vs. absent (fallback dropdown).
- No new automated test suite required — this is a small, low-risk UI addition with no business logic beyond string templating and browser API branching.
