import type { NextConfig } from "next";

// Sur App Hosting, la config web Firebase est injectée au build dans FIREBASE_WEBAPP_CONFIG.
// On la recopie dans une variable publique pour le SDK client.
const firebaseConfig =
  process.env.NEXT_PUBLIC_FIREBASE_CONFIG ?? process.env.FIREBASE_WEBAPP_CONFIG ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_FIREBASE_CONFIG: firebaseConfig,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "i.vimeocdn.com" },
    ],
  },
};

export default nextConfig;
