import { expect, test } from "@playwright/test";
import { login, THEO } from "./helpers";

test("statistiques : chiffres clés, courbes mensuelles, formations et décrochage", async ({
  page,
}) => {
  await login(page, THEO);
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Statistiques" })
    .click();
  await expect(page.getByRole("heading", { name: "Statistiques" })).toBeVisible();
  await expect(page.getByText("Nouveaux élèves", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Aucune vente sur la période.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Nouveaux élèves par mois" })).toBeVisible();

  // Info-bulle au clavier sur une colonne, et vue tableau.
  const columns = page.getByRole("group", { name: "Nouveaux élèves par mois" }).getByRole("button");
  await expect(columns).toHaveCount(12);
  await columns.last().focus();
  await expect(page.getByRole("tooltip")).toContainText("Nouveaux élèves");

  await expect(page.getByRole("heading", { name: "Par formation" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Maîtriser After Effects/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Où les élèves décrochent" })).toBeVisible();

  // Filtre période : 6 mois → 6 colonnes.
  await page.getByLabel("Période").selectOption("6");
  await expect(columns).toHaveCount(6);
});
