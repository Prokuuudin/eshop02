# SEO Action Plan — HairShop.lv (eshop02)

**Overall Score:** 40/100 → target 75/100 after Sprint 3  
**Date:** 2026-06-02

---

## CRITICAL — Fix Immediately (blocks indexing)

### 1. Set production domain URL
**File:** `.env.production` (create if missing)
```env
NEXT_PUBLIC_SITE_URL=https://yourdomain.lv
```
Also add this to Vercel environment variables. This single change fixes ALL canonical URLs, OG URLs, sitemap URLs, and schema `url` fields.  
**Effort:** 5 min | **Impact:** Unblocks entire site indexing

---

### 2. Fix `app/sitemap.ts` — add 44 missing URLs
**File:** `app/sitemap.ts`

Add blog posts (6), brand pages (35), /contact, /stores, /blog. Use real dates not `new Date()`.  
See corrected skeleton in FULL-AUDIT-REPORT.md (Sitemap section).  
**Effort:** 30 min | **Impact:** 3x sitemap coverage; all existing blog content discoverable

---

### 3. Add `og:image` fallback to root layout
**File:** `app/layout.tsx`

```ts
// In root metadata:
openGraph: {
  images: [{ url: `${siteUrl}/og-default.jpg`, width: 1200, height: 630 }],
},
twitter: {
  card: 'summary_large_image',
  images: [`${siteUrl}/og-default.jpg`],
},
```

Also create `/public/og-default.jpg` (1200×630px).  
**Effort:** 1 hour | **Impact:** Social sharing on every page

---

### 4. Fix Organization schema — brand name + sameAs
**File:** `app/layout.tsx` lines 45-60

```ts
// Replace:
{ "@type": "Organization", "name": "Eshop", "sameAs": ["/about", "/contact"] }

// With:
{
  "@type": "Organization",
  "name": "HairShop.lv",          // or your real brand name
  "legalName": "SIA Miks Plus",
  "url": siteUrl,
  "logo": `${siteUrl}/logo.png`,
  "telephone": "+371 27067730",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Rencenu 10A",
    "addressLocality": "Riga",
    "addressCountry": "LV"
  },
  "sameAs": [
    "https://www.facebook.com/yourpage",
    "https://www.instagram.com/yourpage",
    "https://www.linkedin.com/company/yourpage"
  ]
}
```

Also unify brand name in `app/contact/page.tsx` and `app/blog/[slug]/page.tsx`.  
**Effort:** 1 hour | **Impact:** Entity disambiguation for all AI platforms

---

### 5. Remove fake review from Product schema
**File:** `app/product/[id]/page.tsx` lines 116-127

Delete the `review` array entirely from Product schema. Keep `aggregateRating` only if count is real (fix the `?? 127` fallback — use real count from reviews store or omit).  
**Effort:** 20 min | **Impact:** Prevents Google manual action on review schema

---

### 6. Fix `/about` reference in schema
**File:** `app/layout.tsx` line 49

Remove `${siteUrl}/about` from `sameAs` (page doesn't exist → 404). Replace with real external social URLs (see fix #4).  
**Effort:** 5 min | **Impact:** Removes structured data error

---

## HIGH — Fix within 1 week

### 7. Convert `app/blog/page.tsx` to RSC
**File:** `app/blog/page.tsx`

Remove `"use client"`. Move `useEffect → fetch('/api/blog')` to server-side data fetch in the async server component. Extract only interactive parts (subscribe form, filter buttons) to a small `'use client'` child component.  
**Effort:** 2-4 hours | **Impact:** Blog content becomes indexable; blog posts get internal link equity

---

### 8. Fix `lang` attribute on `<html>` element
**File:** `app/layout.tsx` line 67

```ts
// In RootLayout:
const cookieStore = await cookies()
const lang = cookieStore.get('eshop_language')?.value ?? 'ru'

return <html lang={lang}>
```

**Effort:** 1 hour | **Impact:** Correct language signal for RU/LV market rankings

---

### 9. Add security headers in `next.config.js`
**File:** `next.config.js`

```js
async headers() {
  const securityHeaders = [
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-XSS-Protection', value: '1; mode=block' },
  ]
  return [{ source: '/(.*)', headers: securityHeaders }]
}
```

**Effort:** 30 min | **Impact:** Ranking signal + protection

---

### 10. Fix Product schema SKU
**File:** `app/product/[id]/page.tsx` line 98

```ts
// Replace:
sku: product.id,
// With:
sku: product.sku ?? product.id,
```

Also populate `sku` field in `data/products.ts` for all 14 products missing it.  
**Effort:** 1 hour | **Impact:** Google Shopping product matching

---

### 11. Add `seller` + `shippingDetails` to Product Offer
**File:** `app/product/[id]/page.tsx` lines 103-110

```ts
offers: {
  "@type": "Offer",
  "seller": { "@type": "Organization", "name": "HairShop.lv" },
  "priceCurrency": "EUR",
  "price": product.price.toString(),
  "priceValidUntil": "2027-01-01",   // update periodically
  "availability": product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
  "shippingDetails": {
    "@type": "OfferShippingDetails",
    "shippingRate": { "@type": "MonetaryAmount", "value": "4", "currency": "EUR" },
    "deliveryTime": { "@type": "ShippingDeliveryTime", "businessDays": { "@type": "QuantitativeValue", "minValue": 1, "maxValue": 3 } }
  }
}
```

**Effort:** 2 hours | **Impact:** Google Shopping eligibility

---

### 12. Add `generateMetadata` to `/stores` and `/contact`
**Files:** `app/stores/page.tsx`, `app/contact/page.tsx`

Add RSC wrapper layout for each with `generateMetadata` returning:
- `title: "Stores | HairShop.lv"` / `"Contact | HairShop.lv"`
- `alternates: { canonical: '/stores' }` / `{ canonical: '/contact' }`
- `description` with location info

**Effort:** 1 hour | **Impact:** Removes duplicate title; enables indexation

---

### 13. Fix Product og:image + OG type
**File:** `app/product/[id]/page.tsx`

```ts
openGraph: {
  type: 'product',   // not 'website'
  images: [{ url: `${siteUrl}${product.image}`, width: 800, height: 800 }],
},
twitter: {
  images: [`${siteUrl}${product.image}`],
},
```

**Effort:** 30 min | **Impact:** Social sharing previews for product links

---

### 14. Add Article schema to blog post pages
**File:** `app/blog/[slug]/page.tsx`

Add server-side Article schema (before passing to BlogPostContent client component):
```ts
const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": post.title,
  "description": post.excerpt,
  "author": { "@type": "Person", "name": post.author },
  "datePublished": post.createdAt,
  "image": `${siteUrl}${post.image}`,
  "publisher": { "@type": "Organization", "name": "HairShop.lv" }
}
```

Also fix: `const language: Language = 'en'` → resolve from cookies.  
**Effort:** 2 hours | **Impact:** Blog posts eligible for Article rich results; correct language indexing

---

## MEDIUM — Fix within 1 month

### 15. Convert Hero to RSC + add image priority
**File:** `components/Hero.tsx`

Extract translation props to be passed from server. Add `priority` to hero `<Image>`. This directly improves LCP.  
**Effort:** 3-4 hours | **Impact:** LCP improvement on homepage

---

### 16. Add `ItemList` schema to catalog page
**File:** `app/catalog/page.tsx`

Emit server-side ItemList schema listing product URLs:
```ts
const catalogSchema = {
  "@type": "ItemList",
  "itemListElement": PRODUCTS.map((p, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "url": `${siteUrl}/product/${p.id}`
  }))
}
```

**Effort:** 1 hour | **Impact:** Catalog page rich results; product carousels

---

### 17. Add product descriptions to all 16 products
**File:** `data/products.ts`

Populate `description` field for each product (150+ words: what it does, who it's for, key ingredients/specs, usage context, B2B note if applicable). This is the highest-content-quality fix.  
**Effort:** 4-8 hours (content writing) | **Impact:** Rich results, E-E-A-T, AI citations

---

### 18. Create `/public/llms.txt`
**File:** `public/llms.txt`

```
# HairShop.lv — Professional Cosmetics for Salons and Retail
> Professional hair, skin, and nail care products. B2B accounts with bulk pricing, invoicing, and team management. 7 physical stores in Latvia.

## Key pages
- /catalog — Full product catalog
- /delivery-payment — Delivery (OMNIVA from €4) and payment options
- /blog — Professional cosmetics guides
- /stores — 7 store locations in Latvia
- /request-quote — B2B bulk quotes
```

**Effort:** 1 hour | **Impact:** AI platform citation guidance

---

### 19. Add `Sitemap:` and AI crawler rules to `robots.txt`
**File:** `public/robots.txt` (or `app/robots.ts`)

```
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

Sitemap: https://yourdomain.lv/sitemap.xml
```

**Effort:** 15 min | **Impact:** AI crawler discoverability

---

### 20. Add `loading="eager"` to above-fold ProductCards
**File:** `components/ProductCard.tsx`

Pass `priority` prop from catalog page for first 4 cards:
```tsx
// In CatalogPage, pass index:
<ProductCard key={p.id} product={p} priority={index < 4} />
// In ProductCard:
<Image loading={priority ? 'eager' : 'lazy'} priority={priority} ... />
```

**Effort:** 30 min | **Impact:** LCP improvement on catalog page

---

### 21. Create category landing pages
**Files:** `app/catalog/face/page.tsx`, `app/catalog/hair/page.tsx`, etc.

One page per category with: H1, intro paragraph (200+ words), filtered product grid (SSR), link to relevant pillar blog post. Add to sitemap.  
**Effort:** 4-6 hours | **Impact:** Category-level keyword ranking; hub for content clusters

---

### 22. Add image sitemap
**File:** `app/image-sitemap.xml/route.ts` (new Route Handler)

Generate XML with `<image:image>` entries for all product images. Reference from `sitemap.ts` as a separate sitemap index entry.  
**Effort:** 2 hours | **Impact:** Google Image Search discovery for 80+ product images

---

### 23. Add bulk pricing to Product schema
**File:** `app/product/[id]/page.tsx`

For products with `bulkPricingTiers`, emit multiple Offer nodes with `eligibleQuantity`:
```ts
// When bulkPricingTiers exists:
offers: product.bulkPricingTiers?.map(tier => ({
  "@type": "Offer",
  "price": tier.pricePerUnit.toString(),
  "priceCurrency": "EUR",
  "eligibleQuantity": { "@type": "QuantitativeValue", "minValue": tier.quantity }
}))
```

**Effort:** 2 hours | **Impact:** B2B buyer discoverability for wholesale queries

---

## LOW — Backlog

### 24. Add hreflang implementation
All `generateMetadata` calls need `alternates.languages` for ru/en/lv.  
**Effort:** 4-8 hours | **Impact:** Correct language serving for Latvian/Russian users

### 25. Convert `/delivery-payment` to RSC
Move FAQ content to server component so FAQ schema appears in initial HTML.  
**Effort:** 2-3 hours | **Impact:** FAQ schema visible to AI crawlers; FAQ rich results

### 26. Add favicon
Create `app/favicon.ico` and `public/apple-icon.png`.  
**Effort:** 30 min | **Impact:** Brand signal in SERP mobile results

### 27. Implement IndexNow
Generate key, place in `/public/`, add meta tag, call API on content publish.  
**Effort:** 2 hours | **Impact:** Instant Bing/Yandex indexing (relevant Baltic market)

### 28. Create actual secondary product images
Commission or generate `p1-2.jpg` through `p16-5.jpg` (64 images currently 404).  
**Effort:** Asset work | **Impact:** Eliminates 404s; enables real product gallery

### 29. Content cluster execution (Phase 1-3)
Create 4 pillar pages + 12 spoke articles per cluster plan in FULL-AUDIT-REPORT.md.  
**Effort:** 30-50 hours content | **Impact:** 4x organic traffic potential, long-term

---

## Sprint Plan

### Sprint 1 (Days 1-2) — Unblock indexing
- [x] #1 Set NEXT_PUBLIC_SITE_URL
- [x] #2 Fix sitemap.ts (add blog + brands)
- [x] #3 Add og:image fallback
- [x] #4 Fix Organization schema + brand name
- [x] #5 Remove fake review from schema
- [x] #6 Fix /about in sameAs

**Expected score after Sprint 1:** ~52/100

### Sprint 2 (Days 3-7) — Structural fixes
- [x] #7 Convert blog/page.tsx to RSC
- [x] #8 Fix lang attribute
- [x] #9 Add security headers
- [x] #10 Fix SKU in schema
- [x] #11 Add seller + shippingDetails to Offer
- [x] #12 Add generateMetadata to /stores and /contact
- [x] #13 Fix product og:image + type
- [x] #14 Add Article schema to blog posts

**Expected score after Sprint 2:** ~62/100

### Sprint 3 (Weeks 2-4) — Optimization
- [x] #15-23 Medium priority fixes
- Content cluster Phase 1 (face care)

**Expected score after Sprint 3:** ~72-75/100

### Backlog (Month 2+)
- Hreflang full implementation
- Content clusters Phase 2-3
- Secondary product images
- IndexNow
