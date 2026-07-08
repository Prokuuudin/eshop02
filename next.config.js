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
        if (process.env.NODE_ENV !== 'development') {
            return [];
        }

        // Prevent stale dev assets/chunks from being reused by browser cache.
        return [
            {
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
            },
        ];
    },
};

module.exports = nextConfig;
