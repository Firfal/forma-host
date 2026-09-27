import { expect, test } from "@playwright/test";
import { login, THEO } from "./helpers";

test("pages légales : informations de l'école, pages publiques et liens de pied de page", async ({
  page,
  browser,
}) => {
  await login(page, THEO);
  await page.goto("/admin/parametres");
  const card = page.locator("div.rounded-card", {
    has: page.getByRole("heading", { name: "Informations légales" }),
  });
  await expect(card.getByText("À remplir avant de vendre")).toBeVisible();

  // Champs obligatoires signalés, puis publication.
  await card.getByLabel("SIRET").fill("1234");
  await card.getByRole("button", { name: "Publier les pages légales" }).click();
  await expect(card.getByText("SIRET (14 chiffres) ou SIREN (9 chiffres)")).toBeVisible();
  await card.getByLabel("Forme juridique").fill("Entreprise individuelle (micro-entreprise)");
  await card.getByLabel("SIRET").fill("123 456 789 00012");
  await card.getByLabel("Adresse du siège").fill("1 rue de la Paix, 75002 Paris");
  await card.getByLabel("Directeur de la publication").fill("Théo Robert");
  await card.getByLabel("Email de contact").fill("contact@ecolemotion.com");
  await card.getByLabel("Garantie « satisfait ou remboursé »").selectOption("14");
  await card.getByRole("button", { name: "Publier les pages légales" }).click();
  await expect(page.getByText("Pages légales publiées")).toBeVisible();
  // Médiateur manquant : signalé.
  await expect(card.getByText("À compléter")).toBeVisible();
  await card.getByLabel("Médiateur de la consommation").fill("CM2C");
  await card.getByRole("button", { name: "Enregistrer" }).click();
  await expect(card.getByText("Publiées")).toBeVisible();

  // Pages publiques, liées depuis le pied de page de l'école.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/ecole-motion");
  await visitor
    .getByRole("navigation", { name: "Informations légales" })
    .getByRole("link", { name: "Conditions générales de vente" })
    .click();
  await expect(
    visitor.getByRole("heading", { name: "Conditions générales de vente" }),
  ).toBeVisible();
  await expect(visitor.getByText(/dans les 14 jours suivant l'achat/)).toBeVisible();
  await expect(visitor.getByText(/médiateur de la consommation : CM2C/)).toBeVisible();
  await visitor.goto("/ecole-motion/legal/mentions-legales");
  await expect(visitor.getByText("SIRET : 12345678900012.")).toBeVisible();
  await expect(visitor.getByText("Théo Robert")).toBeVisible();
  await visitor.goto("/ecole-motion/legal/confidentialite");
  await expect(visitor.getByRole("heading", { name: "Vos droits" })).toBeVisible();
});
