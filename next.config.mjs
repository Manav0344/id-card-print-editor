/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // React-Konva can reference the optional Node "canvas" package during bundling.
    // The editor only runs in the browser, so this optional dependency is safely ignored.
    config.resolve.alias.canvas = false;
    return config;
  }
};

export default nextConfig;
