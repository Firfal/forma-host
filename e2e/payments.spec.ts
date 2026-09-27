import { expect, test } from "@playwright/test";
import { login, publishLegalInfo, stubVimeo, THEO } from "./helpers";

test("vente directe : Stripe relié, prix, code promo, achat puis accès", async ({
  page,
  browser,
}) => {
  // Deux navigateurs, inscription et achat : plus long que les autres scénarios.
  test.setTimeout(120_000);
  // Informations légales de l'école : CGV liées au paiement, facture émise à l'achat.
  await publishLegalInfo("ecole-motion");
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
  // Récapitulatif : l'accès immédiat exige de renoncer au droit de rétractation.
  const order = buyer.getByRole("dialog", { name: "Ta commande" });
  const pay = order.getByRole("button", { name: "Continuer vers le paiement" });
  await expect(pay).toBeDisabled();
  await expect(order.getByRole("link", { name: "conditions générales de vente" })).toHaveAttribute(
    "href",
    "/ecole-motion/legal/cgv",
  );
  await order.getByRole("checkbox").check();
  await pay.click();
  await expect(buyer.getByText("Merci pour ton achat !")).toBeVisible();
  await buyer.getByRole("link", { name: "Commencer la formation" }).click();
  await expect(buyer.getByText("0 sur 15 terminé")).toBeVisible();

  // Facture de l'acheteur, dans « Mon compte » (série de test : aucun paiement réel).
  await buyer.goto("/compte");
  const purchases = buyer.locator("div.rounded-card", {
    has: buyer.getByRole("heading", { name: "Mes achats" }),
  });
  await purchases.getByRole("link", { name: "Facture" }).click();
  await expect(buyer.getByRole("heading", { name: "Facture", exact: true })).toBeVisible();
  await expect(buyer.getByText(/N° TEST-F-\d{4}-0001/)).toBeVisible();
  await expect(buyer.getByText("Facture de test : aucun paiement réel.")).toBeVisible();
  await expect(buyer.getByText(/293 B du Code général des impôts/)).toBeVisible();

  // La vente apparaît côté formateur, avec sa facture, puis la vente directe est désactivée.
  await page.reload();
  await expect(page.getByText(/^1 vente · /)).toBeVisible();
  await expect(page.getByText("Test", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Facture" })).toBeVisible();
  await page.fill("#course-price", "");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Vente directe désactivée")).toBeVisible();
});
