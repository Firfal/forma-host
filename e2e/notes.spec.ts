import { expect, test } from "@playwright/test";
import { ANNE, login } from "./helpers";

test("notes : l'élève prend des notes sur une leçon et les retrouve sur la formation", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page, ANNE);
  await page.goto("/formations/after-effects/l1");
  await page.getByRole("button", { name: /Mes notes/ }).click();
  const notes = page.getByLabel("Mes notes sur cette leçon");
  await notes.fill("Raccourci : F9 pour un easy ease.\nÀ revoir avant l'exercice.");
  await expect(page.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();

  // Page de la formation : la note apparaît avec sa leçon, et y ramène.
  await page.goto("/formations/after-effects");
  const section = page.locator("section", {
    has: page.getByRole("heading", { name: "Mes notes" }),
  });
  await expect(section.getByText("Raccourci : F9 pour un easy ease.")).toBeVisible();
  await section.getByRole("link", { name: /Introduction à la formation/ }).click();
  await expect(page).toHaveURL(/\/formations\/after-effects\/l1$/);
  // Note existante : ouverte d'office.
  await expect(page.getByLabel("Mes notes sur cette leçon")).toHaveValue(/F9 pour un easy ease/);

  // Vidée : supprimée, la liste disparaît.
  await page.getByLabel("Mes notes sur cette leçon").fill("");
  await expect(page.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();
  await page.goto("/formations/after-effects");
  await expect(page.getByRole("link", { name: /Continuer|Commencer|Revoir/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mes notes" })).toHaveCount(0);
});
