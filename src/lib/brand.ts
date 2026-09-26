/**
 * Nom de la plateforme (pages de connexion, espace élève). Côté formateur, la barre latérale
 * affiche le nom de son école. Surchargé par NEXT_PUBLIC_BRAND_NAME.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Forma Host",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};
