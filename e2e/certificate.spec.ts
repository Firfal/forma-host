import { expect, test } from "@playwright/test";
import { ANNE, completeCourseFor, login } from "./helpers";

test("certificat : formation terminée, certificat nominatif et vérifiable", async ({
  page,
  browser,
}) => {
  await completeCourseFor(ANNE.email, "after-effects");
  await login(page, ANNE);
  await page.goto("/formations/after-effects");
  await page.getByRole("button", { name: "Obtenir mon certificat" }).click();
  const dialog = page.getByRole("dialog", { name: "Ton certificat de réussite" });
  await dialog.getByLabel("Nom sur le certificat").fill("Anne Martin");
  await dialog.getByRole("button", { name: "Créer mon certificat" }).click();

  await expect(page).toHaveURL(/\/certificats\/[\w-]+$/);
  await expect(page.getByRole("heading", { name: "Anne Martin" })).toBeVisible();
  await expect(page.getByText("Certificat de réussite")).toBeVisible();
  await expect(page.getByText(/Certificat authentique, délivré par Ecole Motion/)).toBeVisible();
  const url = page.url();

  // Public : vérifiable sans compte.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(url);
  await expect(visitor.getByRole("heading", { name: "Anne Martin" })).toBeVisible();

  // « Mes formations » : formation terminée, lien vers le certificat.
  await page.goto("/formations");
  await expect(page.getByText("Terminée").first()).toBeVisible();
  await page.getByRole("link", { name: "Mon certificat" }).first().click();
  await expect(page).toHaveURL(url);
});
