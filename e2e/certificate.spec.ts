import { expect, test } from "@playwright/test";
import { completeCourseFor, login } from "./helpers";

// Élève réservé à ce scénario (données de démo) : les autres comptent la progression d'Anne.
const PIERRE = { email: "pierre@exemple.fr", password: "eleve123" };

test("certificat : formation terminée, certificat nominatif et vérifiable", async ({
  page,
  browser,
}) => {
  await completeCourseFor(PIERRE.email, "after-effects");
  await login(page, PIERRE);
  await page.goto("/formations/after-effects");
  await page.getByRole("button", { name: "Obtenir mon certificat" }).click();
  const dialog = page.getByRole("dialog", { name: "Ton certificat de réussite" });
  await dialog.getByLabel("Nom sur le certificat").fill("Pierre Levallois");
  await dialog.getByRole("button", { name: "Créer mon certificat" }).click();

  await expect(page).toHaveURL(/\/certificats\/[\w-]+$/);
  await expect(page.getByRole("heading", { name: "Pierre Levallois" })).toBeVisible();
  await expect(page.getByText("Certificat de réussite")).toBeVisible();
  await expect(page.getByText(/Certificat authentique, délivré par Ecole Motion/)).toBeVisible();
  const url = page.url();

  // Public : vérifiable sans compte.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(url);
  await expect(visitor.getByRole("heading", { name: "Pierre Levallois" })).toBeVisible();

  // « Mes formations » : formation terminée, lien vers le certificat.
  await page.goto("/formations");
  await expect(page.getByText("Terminée").first()).toBeVisible();
  await page.getByRole("link", { name: "Mon certificat" }).first().click();
  await expect(page).toHaveURL(url);
});
