import { expect, test } from "@playwright/test";
import { login, stubVimeo, THEO } from "./helpers";

test("vente directe : Stripe relié, prix, code promo, achat puis accès", async ({
  page,
  browser,
}) => {
  // Deux navigateurs, inscription et achat : plus long que les autres scénarios.
  test.setTimeout(120_000);
  await login(page, THEO);
  await page.goto("/admin/parametres");
  await page.getByRole("button", { name: "Connecter mon compte Stripe" }).click();
  await expect(page.getByText("Compte Stripe relié")).toBeVisible();
  await expect(page.getByText("Ton compte Stripe est actif")).toBeVisible();
  // Clé de test sur la plateforme : aucun vrai paiement, c'est affiché.
  await expect(page.getByText("Mode test", { exact: true })).toBeVisible();

  // Prix et code promo de la formation.
  await page.goto("/admin/formations/after-effects/vente");
  await page.fill("#course-price", "197");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Prix enregistré")).toBeVisible();
  await page.fill("#promo-code", "bienvenue");
  await page.fill("#promo-value", "20");
  await page.getByRole("button", { name: "Créer le code" }).click();
  await expect(page.getByText("Code BIENVENUE créé")).toBeVisible();
  await expect(page.getByText("-20 %")).toBeVisible();

  // Un visiteur crée son compte, achète (paiement simulé) et accède à la formation.
  const buyer = await (await browser.newContext()).newPage();
  await stubVimeo(buyer);
  await buyer.goto("/inscription");
  await buyer.fill("#name", "Paul Durand");
  await buyer.fill("#email", `paul-${Date.now()}@exemple.fr`);
  await buyer.fill("#password", "paul12345");
  await buyer.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(buyer).toHaveURL(/\/formations$/);
  await buyer.goto("/ecole-motion/maitriser-after-effects");
  await buyer.getByRole("button", { name: /197/ }).first().click();
  await expect(buyer.getByText("Merci pour ton achat !")).toBeVisible();
  await buyer.getByRole("link", { name: "Commencer la formation" }).click();
  await expect(buyer.getByText("0 sur 15 terminé")).toBeVisible();

  // La vente apparaît côté formateur, puis la vente directe est désactivée.
  await page.reload();
  await expect(page.getByText("1 vente")).toBeVisible();
  await expect(page.getByText("Test", { exact: true })).toBeVisible();
  await page.fill("#course-price", "");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Vente directe désactivée")).toBeVisible();
});
