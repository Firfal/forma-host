import { expect, test } from "@playwright/test";
import { login, THEO } from "./helpers";

test("premiers pas : étapes cochées, lien vers la bonne section des paramètres, masquables", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page, THEO);
  await page.goto("/admin");
  const card = page.locator("div.rounded-card", {
    has: page.getByRole("heading", { name: "Premiers pas" }),
  });
  await expect(card).toBeVisible();
  // Formation déjà créée (données de démo) : étape cochée, sans lien.
  await expect(card.getByText("Crée ta première formation")).toBeVisible();
  await expect(card.getByRole("link", { name: /Crée ta première formation/ })).toHaveCount(0);

  // Logo absent : la section « École » des paramètres s'ouvre.
  await card.getByRole("link", { name: /Personnalise ton école/ }).click();
  await expect(page).toHaveURL(/\/admin\/parametres#ecole$/);
  await expect(page.getByRole("navigation", { name: "Sections des paramètres" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Sections des paramètres" })
    .getByRole("link", { name: "Intégrations" })
    .click();
  await expect(page).toHaveURL(/#integrations$/);

  // Masqués : ne reviennent pas au rechargement.
  await page.goto("/admin");
  await card.getByRole("button", { name: "Masquer les premiers pas" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Activité récente" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Premiers pas" })).toHaveCount(0);
});
