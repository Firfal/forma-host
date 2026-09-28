import type { NextConfig } from "next";

// Sur App Hosting, la config web Firebase est injectée au build dans FIREBASE_WEBAPP_CONFIG.
// On la recopie dans une variable publique pour le SDK client.
const firebaseConfig =
  process.env.NEXT_PUBLIC_FIREBASE_CONFIG ?? process.env.FIREBASE_WEBAPP_CONFIG ?? "";

// Domaines personnalisés des écoles : « / », « /formation » et « /legal/cgv » servent les pages
// /domaines/{domaine}/… (mises en cache). Les hôtes de la plateforme ne sont jamais réécrits
// (mêmes règles que isPlatformHost : adresse de la plateforme, local, IP, *.hosted.app, *.run.app).
const appHostname = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
const platformHosts = [
  appHostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  "[^.]+",
  "[\\d.]+",
  ".+\\.hosted\\.app",
  ".+\\.run\\.app",
]
  .filter(Boolean)
  .join("|");
const onSchoolDomain = {
  has: [{ type: "host" as const, value: "(?<domain>.+)" }],
  missing: [{ type: "host" as const, value: `(${platformHosts})` }],
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Mode dev (tests E2E) : les pages compilées restent en mémoire au lieu d'être recompilées
  // après quelques secondes d'inactivité. Sans effet en production.
  onDemandEntries: { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 100 },
  env: {
    NEXT_PUBLIC_FIREBASE_CONFIG: firebaseConfig,
  },
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/domaines/:domain", ...onSchoolDomain }],
      // Après les pages de l'application (/connexion, /formations…), avant les routes dynamiques.
      afterFiles: [
        { source: "/legal/:page", destination: "/domaines/:domain/legal/:page", ...onSchoolDomain },
        { source: "/:slug", destination: "/domaines/:domain/:slug", ...onSchoolDomain },
      ],
      fallback: [],
    };
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
