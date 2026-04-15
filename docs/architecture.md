Architecture overview

Stack
- Next.js (App Router)
- React + TypeScript (strict)
- Tailwind CSS for utilities
- shadcn/ui for component primitives (optional later)

Principles
- Production-ready folder layout using `app/` (server components by default).
- Mobile-first responsive styles; small screens first, then breakpoints.
- BEM-style class naming for predictable markup and easy migration to CSS modules or plain CSS if needed.
- Explicit separation of server vs. client components. Keep data fetching and SEO in server components; mark interactivity with `use client`.

SEO
- Use Next's metadata API in `app/layout.tsx` or `app/head.tsx`.
- Use `next/image` for optimized images and `next/link` for client navigation.

Notes about Vite
- Next.js provides SSR, ISR, and edge runtimes which Vite does not provide out of the box. Use Next.js as the main framework. If you want a Vite dev environment for isolated component libraries, put it in a separate package.
