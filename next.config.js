// eslint-disable-next-line @typescript-eslint/no-require-imports -- Next loads this file as CommonJS.
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // ws нельзя бандлить: webpack ломает его optional-нативы (bufferutil) → TypeError bufferUtil.mask
    serverExternalPackages: ['ws', '@neondatabase/serverless'],
    // experimental: {},
    images: {
        qualities: [75, 90],
        // Лого брендов — локальные SVG (/public/brands-distribution и др.); sandbox-CSP отключает скрипты внутри SVG
        dangerouslyAllowSVG: true,
        contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'hairshop.lv',
                pathname: '/content/images/**',
            },
        ],
    },
    webpack: (config, { dev }) => {
        if (dev) {
            // Avoid flaky ENOENT issues in .next/dev/cache on Windows when filesystem cache files disappear mid-write.
            config.cache = false;
        }

        // Prisma 7 generated client uses .js extensions in ESM imports — resolve to .ts
        config.resolve.extensionAlias = {
            '.js': ['.ts', '.tsx', '.js', '.jsx'],
        };
        config.resolve.alias = {
            ...config.resolve.alias,
            '@radix-ui/react-collapsible': path.resolve(
                __dirname,
                'node_modules/@radix-ui/react-collapsible'
            ),
        };

        return config;
    },
    async headers() {
        const rules = [];

        if (process.env.NODE_ENV === 'development') {
            // Prevent stale dev assets/chunks from being reused by browser cache.
            rules.push({
                source: '/_next/static/:path*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'no-store, max-age=0, must-revalidate',
                    },
                    {
                        key: 'Pragma',
                        value: 'no-cache',
                    },
                    {
                        key: 'Expires',
                        value: '0',
                    },
                ],
            });
        }

        // Global security headers — apply everywhere (dev + prod).
        // 'unsafe-eval' only in dev: webpack's dev devtool wraps modules in eval(). Verified via a
        // production build (next build && next start) that eval is NOT needed outside dev.
        const scriptSrc =
            process.env.NODE_ENV === 'development'
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com"
                : "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com";

        const csp = [
            "default-src 'self'",
            // 'unsafe-inline' required: Next.js App Router streams RSC payloads via inline
            // <script>self.__next_f.push(...)</script> with no nonce/src — a stricter policy
            // would break hydration on every page. Proper fix is a nonce-based CSP wired through
            // middleware.ts, which is out of scope here (next.config.js only).
            scriptSrc,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https://hairshop.lv",
            "font-src 'self' data:",
            "connect-src 'self' https://challenges.cloudflare.com",
            // Facebook/YouTube/Vimeo: product demo-video embeds (see isEmbedUrl in ProductVideoGallery).
            "frame-src https://challenges.cloudflare.com https://www.facebook.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            // `next dev` serves HTTP. Upgrading localhost subresources would make the
            // browser request CSS and images from unavailable https://localhost.
            ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
        ].join('; ');

        rules.push({
            source: '/:path*',
            headers: [
                { key: 'Content-Security-Policy', value: csp },
                ...(process.env.NODE_ENV === 'production'
                    ? [{
                        key: 'Strict-Transport-Security',
                        value: 'max-age=63072000; includeSubDomains; preload',
                    }]
                    : []),
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'X-Frame-Options', value: 'DENY' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                {
                    key: 'Permissions-Policy',
                    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
                },
            ],
        });

        return rules;
    },
};

module.exports = nextConfig;
