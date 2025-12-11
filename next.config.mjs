/** @type {import('next').NextConfig} */
const nextConfig = {
    // Mark native modules as external - they can't be bundled by webpack
    webpack: (config, { isServer }) => {
        if (isServer) {
            config.externals.push('@napi-rs/canvas');
        }
        return config;
    },
};

export default nextConfig;
