import type { MetadataRoute } from "next";
import { routes } from "@shared/paths";
import { brand } from "@/lib/brand";

/** Installation sur l'écran d'accueil (indispensable aux notifications push sur iPhone). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: `Formations en ligne — ${brand.name}`,
    lang: "fr",
    // La connexion renvoie directement vers l'accueil de la personne si elle est connectée.
    start_url: routes.login,
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
