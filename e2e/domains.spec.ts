import { expect, test } from "@playwright/test";
import { login, THEO } from "./helpers";

test("domaine d'école : DNS à configurer, puis école servie sur son domaine", async ({
  page,
  browser,
}) => {
  await login(page, THEO);
  await page.goto("/admin/parametres");

  // Domaine en attente : enregistrements DNS à créer (App Hosting simulé en émulateur).
  await page.fill("#school-domain", "https://Formation.EcoleMotion.com/");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText("En attente DNS")).toBeVisible();
  await expect(page.getByText("35.219.200.11")).toBeVisible();
  await expect(page.getByText("fah-claim=demo")).toBeVisible();
  await page.getByRole("button", { name: "Vérifier les DNS" }).click();
  await expect(page.getByText(/Pas encore prêt/)).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Retirer le domaine" }).click();
  await expect(page.getByText("Domaine retiré")).toBeVisible();

  // Domaine actif : l'école est servie à la racine du domaine.
  await page.fill("#school-domain", "actif.ecolemotion.com");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText("actif.ecolemotion.com est actif")).toBeVisible();

  const visitor = await (
    await browser.newContext({ extraHTTPHeaders: { "x-forwarded-host": "actif.ecolemotion.com" } })
  ).newPage();
  await visitor.goto("/");
  await expect(visitor.getByRole("heading", { name: "Ecole Motion" })).toBeVisible();
  await visitor.goto("/maitriser-after-effects");
  await expect(visitor.getByRole("heading", { name: "Le programme" })).toBeVisible();
  await visitor.goto("/connexion");
  await expect(visitor.locator("#email")).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Retirer le domaine" }).click();
  await expect(page.getByText("Domaine retiré")).toBeVisible();
});
