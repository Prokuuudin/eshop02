/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // ws нельзя бандлить: webpack ломает его optional-нативы (bufferutil) → TypeError bufferUtil.mask
    serverExternalPackages: ['ws', '@neondatabase/serverless'],
    // experimental: {},
    images: {
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
