/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // The GOV-3 portal assets live in /public and are loaded as plain files.
  // Never let a browser cache an old copy across builds.
  async headers() {
    const noCache = [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }];
    return [
      { source: "/app.js", headers: noCache },
      { source: "/chat.js", headers: noCache },
      { source: "/styles.css", headers: noCache },
      { source: "/chat.css", headers: noCache },
    ];
  },
};

export default nextConfig;
