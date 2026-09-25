import { expect, test } from "@playwright/test";
import { login, THEO } from "./helpers";

test("le formateur crée une formation, un chapitre, une leçon, puis publie", async ({ page }) => {
  await login(page, THEO);
  await expect(page.getByText("Activité récente")).toBeVisible();

  await page.goto("/admin/formations");
  await page.getByRole("button", { name: "Nouvelle formation" }).click();
  await page.fill("#course-title", "Motion Design : les bases");
  await page.getByRole("button", { name: "Créer la formation" }).click();
  await expect(page).toHaveURL(/\/contenu$/);

  await page.getByRole("button", { name: "Créer le premier chapitre" }).click();
  const title = page.getByRole("textbox", { name: "Titre" });
  await title.fill("Les fondamentaux");
  await title.press("Enter");
  await expect(page.getByText("Les fondamentaux")).toBeVisible();
  await expect(page.getByText("Enregistré")).toBeVisible();

  await page.locator("button", { hasText: "Nouvelle leçon" }).last().click();
  await expect(page).toHaveURL(/\/lecons\//);
  await page.fill("#lesson-title", "Les 12 principes de l'animation");
  await page.fill("#vimeo-url", "https://vimeo.com/76979871/abcdef1234");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText("Vimeo #76979871")).toBeVisible();
  await page.getByRole("button", { name: "Ajouter un lien" }).click();
  await page.getByPlaceholder("Libellé (ex. Discord)").fill("Discord");
  await page.getByPlaceholder("https://…").fill("https://discord.gg/test");
  await page.getByRole("switch").first().click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Leçon enregistrée")).toBeVisible();

  await page.getByRole("link", { name: "Fermer" }).click();
  await expect(page.getByText("Les 12 principes de l'animation")).toBeVisible();
  await expect(page.getByText("Aperçu", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Publier" }).click();
  await expect(page.getByText("Formation publiée !")).toBeVisible();
});

test("la page de vente publique se personnalise", async ({ page }) => {
  await login(page, THEO);
  await page.goto("/admin/formations/after-effects/page-de-vente");
  await page.fill("#headline", "Deviens motion designer");
  await page.fill("#cta-url", "https://buy.stripe.com/test_123");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Page de vente enregistrée")).toBeVisible();

  await page.goto("/ecole-motion/maitriser-after-effects");
  await expect(page.getByRole("heading", { name: "Deviens motion designer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Le programme" })).toBeVisible();
  await expect(page.locator("a", { hasText: "Rejoindre la formation" }).first()).toHaveAttribute(
    "href",
    "https://buy.stripe.com/test_123",
  );
  expect((await page.goto("/ecole-motion/nexiste-pas"))?.status()).toBe(404);
});

test("l'envoi des emails se configure dans Paramètres", async ({ page }) => {
  await login(page, THEO);
  await page.getByRole("link", { name: /Configure l'envoi des emails/ }).click();
  await expect(page).toHaveURL(/\/admin\/parametres$/);
  await expect(page.getByText("Non configuré")).toBeVisible();

  await page.getByRole("tab", { name: "Autre (SMTP)" }).click();
  await page.fill("#mail-host", "metadata.google.internal");
  await page.fill("#mail-username", "theo");
  await page.fill("#mail-password", "secret");
  await page.getByRole("button", { name: "Vérifier et enregistrer" }).click();
  await expect(page.getByText("Adresse du serveur non autorisée")).toBeVisible();

  await page.getByRole("tab", { name: "Gmail" }).click();
  await expect(page.getByText("Mot de passe d'application").first()).toBeVisible();
  await expect(page.locator("#mail-host")).toHaveCount(0);
});
