import { expect, test } from "@playwright/test";
import { login, publishLegalInfo, THEO } from "./helpers";

const PIERRE = { email: "pierre@exemple.fr", password: "eleve123" };

test("Qualiopi : attestation d'assiduité et avis de fin de formation", async ({ browser }) => {
  test.setTimeout(120_000);
  await publishLegalInfo("ecole-motion");
  const theo = await browser.newPage();
  await login(theo, THEO);

  // Attestation d'Anne : jeu de démo (3 jours, 2 h) plus le temps passé par les autres scénarios.
  await theo.goto("/admin/formations/after-effects");
  await theo.getByRole("button", { name: "Actions pour anne@exemple.fr" }).click();
  await theo.getByRole("menuitem", { name: "Attestation d'assiduité" }).click();
  await expect(theo.getByRole("heading", { name: "Attestation d'assiduité" })).toBeVisible();
  await expect(theo.getByText("Temps de connexion aux leçons").locator("..")).toContainText(
    /[2-9] h \d{2}/,
  );
  await expect(theo.getByText("Jours de connexion").locator("..")).toContainText(/[3-9]/);
  await expect(theo.getByText("Relevé de connexion")).toBeVisible();
  await expect(theo.getByRole("button", { name: "Télécharger en PDF" })).toBeVisible();

  // Pierre (presque au bout de la formation) donne son avis.
  const pierre = await browser.newPage();
  await login(pierre, PIERRE);
  await pierre.goto("/formations/after-effects");
  await pierre.getByRole("radio", { name: /^5 sur 5/ }).click();
  await pierre.getByRole("button", { name: "Oui", exact: true }).click();
  await pierre.getByLabel("Ton commentaire").fill("Formation claire et très complète.");
  await pierre.getByRole("button", { name: "Envoyer mon avis" }).click();
  await expect(pierre.getByRole("button", { name: "Modifier" })).toBeVisible();

  // L'école le retrouve dans ses statistiques.
  await theo.goto("/admin/statistiques");
  await expect(theo.getByText("Satisfaction des élèves")).toBeVisible();
  await expect(theo.getByText("Formation claire et très complète.")).toBeVisible();
  await expect(theo.getByText(/% recommandent la formation/)).toBeVisible();
});
