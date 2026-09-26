/** Région unique du projet (App Hosting, Firestore, Storage, Functions). */
export const REGION = "europe-west4";

/** Backend App Hosting qui sert l'application (et les domaines personnalisés des écoles). */
export const APP_HOSTING_BACKEND = "forma-host";

/** Durée de validité d'une invitation (lien « Activer mon compte »). */
export const INVITE_TTL_DAYS = 30;

/** Part de la vidéo à regarder pour marquer une leçon comme terminée automatiquement. */
export const AUTO_COMPLETE_RATIO = 0.9;

/** Nombre max d'élèves par appel à grantAccess (import CSV découpé côté client). */
export const GRANT_ACCESS_BATCH_MAX = 200;

/** Taille max des éléments du plan d'une formation (le document doit rester < 1 Mo). */
export const OUTLINE_MAX_ITEMS = 500;

/** Slugs réservés : ils correspondent à des routes de l'application. */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "bienvenue",
  "c",
  "compte",
  "connexion",
  "devenir-formateur",
  "formations",
  "inscription",
  "mot-de-passe-oublie",
  "notifications",
  "plateforme",
  "_next",
  "static",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

export const DEFAULT_WELCOME_EMAIL = {
  subject: "Bienvenue dans {{formation}} !",
  body: [
    "Bonjour {{prenom}},",
    "",
    "Tu as désormais accès à la formation « {{formation}} ».",
    "Clique sur le bouton ci-dessous pour commencer.",
    "",
    "À très vite,",
    "{{formateur}}",
  ].join("\n"),
};

/** Variables utilisables dans le modèle d'email de bienvenue. */
export const WELCOME_EMAIL_VARIABLES = ["prenom", "formation", "formateur", "lien"] as const;
