import type { NextConfig } from "next";

// Sur App Hosting, la config web Firebase est injectée au build dans FIREBASE_WEBAPP_CONFIG.
// On la recopie dans une variable publique pour le SDK client.
const firebaseConfig =
  process.env.NEXT_PUBLIC_FIREBASE_CONFIG ?? process.env.FIREBASE_WEBAPP_CONFIG ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Mode dev (tests E2E) : les pages compilées restent en mémoire au lieu d'être recompilées
  // après quelques secondes d'inactivité. Sans effet en production.
  onDemandEntries: { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 100 },
  env: {
    NEXT_PUBLIC_FIREBASE_CONFIG: firebaseConfig,
  },
  async headers() {
    // Le service worker des notifications doit être revérifié à chaque visite.
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "i.vimeocdn.com" },
    ],
  },
};

export default nextConfig;
