import { expect, test } from "@playwright/test";
import { login, THEO } from "./helpers";

test("domaine d'école : parcours guidé, puis école servie sur son domaine", async ({
  page,
  browser,
}) => {
  await login(page, THEO);
  await page.goto("/admin/parametres");
  const card = page.locator("div.rounded-card", {
    has: page.getByRole("heading", { name: "Domaine personnalisé" }),
  });

  // Domaine principal : un sous-domaine est proposé.
  await page.fill("#school-domain", "ecolemotion.com");
  await expect(card.getByText("est ton domaine principal")).toBeVisible();
  await card.getByRole("button", { name: "Utiliser formation.ecolemotion.com" }).click();
  await expect(page.locator("#school-domain")).toHaveValue("formation.ecolemotion.com");
  await page.fill("#school-domain", "https://Formation.EcoleMotion.com/");
  await expect(card.getByText("https://formation.ecolemotion.com")).toBeVisible();

  // Enregistrements à créer (App Hosting simulé), avec le guide de l'hébergeur détecté.
  await card.getByRole("button", { name: "Connecter le domaine" }).click();
  await expect(card.getByText("Action requise")).toBeVisible();
  await expect(card.getByText("Configure le DNS chez IONOS")).toBeVisible();
  await expect(card.getByRole("link", { name: /Ouvrir IONOS/ })).toBeVisible();
  await expect(card.getByText("À ajouter")).toHaveCount(3);
  await expect(
    card.getByRole("button", { name: "Copier la valeur : 35.219.200.11" }),
  ).toBeVisible();
  await expect(card.getByRole("button", { name: "Copier le nom : formation" })).toHaveCount(2);
  await expect(
    card.getByRole("button", { name: "Copier le nom : _acme-challenge_demo.formation" }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Vérifier maintenant" }).click();
  await expect(page.getByText(/3 enregistrements pas encore visibles/)).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await card.getByRole("button", { name: "Changer" }).click();
  await expect(page.getByText("Domaine retiré")).toBeVisible();

  // DNS déjà publiés : enregistrements détectés, vérification automatique en cours.
  await page.fill("#school-domain", "verif.ecolemotion.com");
  await card.getByRole("button", { name: "Connecter le domaine" }).click();
  await expect(card.getByText("Vérification en cours")).toBeVisible();
  await expect(card.getByText("Enregistrements DNS en place")).toBeVisible();
  await expect(card.getByText("Ton adresse mène bien à ton école.")).toBeVisible();
  await expect(card.getByText(/confirmation par Google/)).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await card.getByRole("button", { name: "Retirer le domaine" }).click();
  await expect(page.getByText("Domaine retiré")).toBeVisible();

  // Domaine actif : l'école est servie à la racine du domaine.
  await page.fill("#school-domain", "actif.ecolemotion.com");
  await card.getByRole("button", { name: "Connecter le domaine" }).click();
  await expect(page.getByText("actif.ecolemotion.com est en ligne")).toBeVisible();
  await expect(card.getByText("Actif", { exact: true })).toBeVisible();

  const visitor = await (
    await browser.newContext({ extraHTTPHeaders: { "x-forwarded-host": "actif.ecolemotion.com" } })
  ).newPage();
  await visitor.goto("/");
  await expect(visitor.getByRole("heading", { name: "Ecole Motion" })).toBeVisible();
  // Liens directs vers l'adresse finale du domaine (pas de redirection /ecole-motion/… → /…).
  await expect(
    visitor.locator('a[href="https://actif.ecolemotion.com/maitriser-after-effects"]'),
  ).toBeVisible();
  await visitor.goto("/maitriser-after-effects");
  await expect(visitor.getByRole("heading", { name: "Le programme" })).toBeVisible();
  await visitor.goto("/connexion");
  await expect(visitor.locator("#email")).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await card.getByRole("button", { name: "Retirer le domaine" }).click();
  await expect(page.getByText("Domaine retiré")).toBeVisible();
});
