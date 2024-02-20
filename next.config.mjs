import { env } from "./src/env.mjs";

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.mjs");

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,

  /**
   * If you have `experimental: { appDir: true }` set, then you must comment the below `i18n` config
   * out.
   *
   * @see https://github.com/vercel/next.js/issues/41980
   */
  i18n: {
    locales: ["sv-SE"],
    defaultLocale: "sv-SE",
  },
  images: {
    remotePatterns: [
      {
        hostname: "*.vastrasidan.se",
        protocol: "https",
      },
      {
        hostname: "vastrasidan.se",
        protocol: "https",
      },
    ]
  },
  rewrites: async () => {
    return [
      {
        source: '/_project/_media/_gfx/:path*',
        destination: `${env.NEXT_PUBLIC_WORDPRESS_URL}/wp-content/uploads/gamla_bilder/:path*`,
        basePath: false,
      },
    ]
  },
};

export default config;
