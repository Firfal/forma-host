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
  // Première visite de la page : compilée à la demande en mode dev (lent sur la CI).
  await expect(page.getByRole("heading", { name: "Statistiques" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Nouveaux élèves", { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  // Avec ou sans vente (selon les scénarios déjà passés) : graphique ou message vide.
  await expect(page.getByRole("heading", { name: "Chiffre d'affaires par mois" })).toBeVisible();
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
