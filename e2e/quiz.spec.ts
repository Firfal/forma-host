import { expect, test, type Page } from "@playwright/test";
import { ANNE, login, THEO } from "./helpers";

const EDITOR = "/admin/formations/after-effects/lecons/l2";

async function saveLesson(page: Page) {
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Leçon enregistrée")).toBeVisible();
}

test("quiz : le formateur le crée, l'élève le réussit, les réponses restent cachées", async ({
  browser,
}) => {
  // Deux comptes, éditeur et leçon : compilation à froid comprise, plus d'une minute.
  test.setTimeout(120_000);
  const theo = await browser.newPage();
  await login(theo, THEO);
  await theo.goto(EDITOR);
  await theo.getByRole("button", { name: "Ajouter un quiz" }).click();

  // Question 1 : un seul choix (la 1re réponse est cochée par défaut).
  await theo.getByLabel("Intitulé de la question 1").fill("Quel raccourci crée une image clé ?");
  await theo.getByLabel("Réponse 1", { exact: true }).fill("Alt + clic sur le chronomètre");
  await theo.getByLabel("Réponse 2", { exact: true }).fill("Ctrl + K");
  await theo
    .getByLabel("Explication de la question 1")
    .fill("Le chronomètre active les images clés.");

  // Question 2 : plusieurs bonnes réponses.
  await theo.getByRole("button", { name: "Ajouter une question" }).click();
  const second = theo.getByRole("listitem").filter({ hasText: "Question 2" });
  await theo.getByLabel("Intitulé de la question 2").fill("Quelles interpolations existent ?");
  await second.getByLabel("Réponse 1", { exact: true }).fill("Linéaire");
  await second.getByLabel("Réponse 2", { exact: true }).fill("Bézier");
  await second.getByRole("button", { name: "Ajouter une réponse" }).click();
  await second.getByLabel("Réponse 3", { exact: true }).fill("Carrée");
  await second.getByLabel("Réponse 2 correcte").check();
  await saveLesson(theo);

  try {
    const anne = await browser.newPage();
    await login(anne, ANNE);
    await anne.goto("/formations/after-effects/l2");
    const quiz = anne.locator("#quiz");
    await expect(quiz.getByText("2 questions · 70 % pour réussir")).toBeVisible();
    await expect(quiz.getByText("Plusieurs réponses possibles.")).toBeVisible();

    // Mauvaises réponses : score, explication, bonnes réponses non révélées.
    await quiz.getByLabel("Ctrl + K").check();
    await quiz.getByLabel("Carrée").check();
    await quiz.getByRole("button", { name: "Valider mes réponses" }).click();
    await expect(quiz.getByRole("status")).toContainText("0/2 bonnes réponses (0 %)");
    await expect(quiz.getByText("Le chronomètre active les images clés.")).toBeVisible();
    await expect(quiz.getByText("À revoir")).toHaveCount(2);
    await expect(quiz.getByText("Meilleur score · 0 %")).toBeVisible();

    // Deuxième tentative réussie.
    await quiz.getByRole("button", { name: "Recommencer" }).click();
    await quiz.getByLabel("Alt + clic sur le chronomètre").check();
    await quiz.getByLabel("Linéaire").check();
    await quiz.getByLabel("Bézier").check();
    await quiz.getByRole("button", { name: "Valider mes réponses" }).click();
    await expect(quiz.getByRole("status")).toContainText("2/2 bonnes réponses (100 %) · Réussi !");
    await expect(quiz.getByText("Réussi · 100 %")).toBeVisible();

    // Au retour sur la leçon : quiz réussi, possibilité de le refaire.
    await anne.reload();
    await expect(
      anne.getByText("Tu as réussi ce quiz avec 100 % de bonnes réponses."),
    ).toBeVisible();

    // Le formateur voit les résultats.
    await theo.reload();
    await expect(theo.getByText("Ont répondu").locator("..")).toContainText("1");
    await expect(theo.getByText("Ont réussi").locator("..")).toContainText("1");
    await expect(theo.getByText("Score moyen").locator("..")).toContainText("100 %");
  } finally {
    // Leçon rendue sans quiz : les autres scénarios partent des mêmes données.
    await theo.goto(EDITOR);
    theo.once("dialog", (dialog) => dialog.accept());
    await theo.getByRole("button", { name: "Supprimer le quiz" }).click();
    await saveLesson(theo);
  }
});
