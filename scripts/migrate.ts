/**
 * Migrations de données, idempotentes, lancées à chaque déploiement.
 *
 *   npx tsx scripts/migrate.ts --project forma-host
 *   npx tsx scripts/migrate.ts --emulators
 *
 * - Co-gestion : chaque école a sa fiche « owner », adminUids et les claims `schools`.
 * - Paiements : platform/settings.paymentsEnabled (clé Stripe présente, PAYMENTS_ENABLED=true)
 *   et stripeLivemode (clé réelle, STRIPE_LIVEMODE=true ; sinon mode test).
 */
import { initAdmin, parseArgs } from "./admin";
import { ensureSchoolOwner } from "./school-owner";

async function main() {
  const { auth, db, projectId } = initAdmin(parseArgs());
  const creators = await db.collection("creators").get();
  for (const creator of creators.docs) {
    try {
      await ensureSchoolOwner(auth, db, creator.id);
    } catch (error) {
      console.warn(`École ${creator.id} ignorée : ${(error as Error).message}`);
    }
  }
  console.log(`✔ ${projectId} : ${creators.size} école(s) à jour (équipe et droits).`);

  const paymentsEnabled = process.env.PAYMENTS_ENABLED === "true";
  const stripeLivemode = paymentsEnabled && process.env.STRIPE_LIVEMODE === "true";
  await db.doc("platform/settings").set({ paymentsEnabled, stripeLivemode }, { merge: true });
  console.log(
    paymentsEnabled
      ? `✔ Paiements activés sur la plateforme (${stripeLivemode ? "mode réel" : "mode test"}).`
      : "✔ Paiements désactivés sur la plateforme.",
  );
}

main().catch((error) => {
  console.error(`✘ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
