/** Marque affichée (V1 : une seule école). Surchargée par les variables d'environnement. */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Ecole Motion",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};
