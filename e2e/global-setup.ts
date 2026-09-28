/**
 * Précompile les pages principales avant les scénarios : en mode dev, Next.js compile chaque
 * page à sa première visite, ce qui peut dépasser les délais d'attente des scénarios (CI lente).
 */
const BASE = "http://localhost:3100";
const COURSE = "after-effects";

const ROUTES = [
  "/connexion",
  "/admin",
  "/admin/formations",
  `/admin/formations/${COURSE}`,
  `/admin/formations/${COURSE}/contenu`,
  `/admin/formations/${COURSE}/details`,
  `/admin/formations/${COURSE}/lecons/l1`,
  `/admin/formations/${COURSE}/vente`,
  `/admin/formations/${COURSE}/annonces`,
  `/admin/formations/${COURSE}/page-de-vente`,
  "/admin/statistiques",
  "/admin/commentaires",
  "/admin/exercices",
  "/admin/membres",
  "/admin/messages",
  "/admin/parametres",
  "/formations",
  `/formations/${COURSE}`,
  `/formations/${COURSE}/l1`,
  "/messages",
  "/compte",
  "/plateforme",
  "/plateforme/demandes",
  "/ecole-motion",
  "/ecole-motion/maitriser-after-effects",
];

export default async function globalSetup() {
  const started = Date.now();
  for (const route of ROUTES) {
    await fetch(`${BASE}${route}`, { signal: AbortSignal.timeout(180_000) }).catch(() => undefined);
  }
  console.log(`Pages précompilées en ${Math.round((Date.now() - started) / 1000)} s`);
}
