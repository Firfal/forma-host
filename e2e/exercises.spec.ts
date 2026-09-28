import { expect, test, type Page } from "@playwright/test";
import { ANNE, login, THEO } from "./helpers";

const EDITOR = "/admin/formations/after-effects/lecons/l4";

async function setExercise(page: Page, enabled: boolean) {
  await page.goto(EDITOR);
  const toggle = page.getByRole("switch", { name: "Exercice à rendre" });
  if ((await toggle.getAttribute("aria-checked")) !== String(enabled)) await toggle.click();
  if (enabled) {
    await page
      .getByLabel("Consignes de l'exercice")
      .fill("Anime le logo de l'école en 5 secondes et envoie ta vidéo.");
  }
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Leçon enregistrée")).toBeVisible();
}

test("exercice : l'élève rend sa vidéo, le formateur la commente au bon moment", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const theo = await browser.newPage();
  await login(theo, THEO);
  await setExercise(theo, true);

  try {
    const anne = await browser.newPage();
    await login(anne, ANNE);
    await anne.goto("/formations/after-effects/l4");
    const exercise = anne.locator("#exercice");
    await expect(exercise.getByText("Anime le logo de l'école en 5 secondes")).toBeVisible();
    await exercise.getByLabel("Fichier de l'exercice").setInputFiles({
      name: "logo-anne.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]),
    });
    await expect(exercise.getByText(/logo-anne\.mp4 · /)).toBeVisible();
    await exercise.getByLabel("Message pour ton formateur").fill("Je bloque sur les courbes.");
    await exercise.getByRole("button", { name: "Envoyer mon exercice" }).click();
    await expect(anne.getByText("Exercice envoyé, ton formateur est prévenu")).toBeVisible();
    await expect(exercise.getByText("En attente de retour")).toBeVisible();

    // Le formateur corrige depuis Exercices.
    await theo.goto("/admin/exercices");
    await theo.getByRole("link", { name: /Anne/ }).first().click();
    await expect(theo.getByText("Je bloque sur les courbes.")).toBeVisible();
    await expect(theo.locator("video")).toBeVisible();
    await theo.getByLabel("Écrire un retour").fill("Adoucis l'arrivée du logo.");
    await expect(theo.getByRole("checkbox", { name: /dans la vidéo/ })).toBeChecked();
    await theo.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(theo.getByRole("button", { name: "Revoir le passage à 0:00" })).toBeVisible();
    await theo.getByRole("button", { name: "Marquer comme corrigé" }).click();
    await expect(theo).toHaveURL(/\/admin\/exercices$/);
    await expect(theo.getByText("Tout est corrigé")).toBeVisible();

    // L'élève voit le retour horodaté.
    await anne.reload();
    await expect(exercise.getByText("Corrigé", { exact: true })).toBeVisible();
    await expect(exercise.getByText("Adoucis l'arrivée du logo.")).toBeVisible();
    await expect(exercise.getByRole("button", { name: "Revoir le passage à 0:00" })).toBeVisible();
    await expect(exercise.getByText("Formateur", { exact: true })).toBeVisible();
  } finally {
    await setExercise(theo, false);
  }
});
