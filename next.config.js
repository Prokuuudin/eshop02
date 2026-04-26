/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // experimental: {},
    images: {
        // Configure allowed external domains here for next/image
        domains: [],
    },
    webpack: (config, { dev }) => {
        if (dev) {
            // Avoid flaky ENOENT issues in .next/dev/cache on Windows when filesystem cache files disappear mid-write.
            config.cache = false;
        }

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
