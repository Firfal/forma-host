import { expect, test } from "@playwright/test";
import { login, THEO } from "./helpers";

test("dupliquer une formation : copie en brouillon avec son plan et ses leçons", async ({
  page,
}) => {
  await login(page, THEO);
  await page.goto("/admin/formations/after-effects/contenu");
  await page.getByRole("button", { name: "Plus d'actions" }).click();
  await page.getByRole("menuitem", { name: "Dupliquer la formation" }).click();
  await expect(page.getByText("Copie créée en brouillon")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/formations\/(?!after-effects)[\w-]+\/contenu$/);
  await expect(page.getByRole("heading", { name: /\(copie\)$/ })).toBeVisible();
  await expect(page.getByText("Brouillon").first()).toBeVisible();
  await expect(page.getByText("Animer un personnage")).toBeVisible();

  // Nettoyage : la copie (brouillon) est supprimée.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Plus d'actions" }).click();
  await page.getByRole("menuitem", { name: /Supprimer/ }).click();
  await expect(page).toHaveURL(/\/admin\/formations$/);
});
