import { expect, test } from "@playwright/test";
import { ANNE, login, THEO } from "./helpers";

test("communauté : l'école l'ouvre, un élève publie, le formateur répond et épingle", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const theo = await browser.newPage();
  await login(theo, THEO);
  await theo.getByRole("link", { name: "Communauté" }).click();
  await theo.getByRole("button", { name: "Ouvrir la communauté" }).click();
  await expect(theo.getByLabel("Nouveau message")).toBeVisible();

  try {
    const anne = await browser.newPage();
    await login(anne, ANNE);
    await anne.getByRole("link", { name: "Communauté" }).click();
    await expect(anne).toHaveURL(/\/communaute\//);
    await anne.getByLabel("Nouveau message").fill("Voici mon premier logo animé, vos avis ?");
    await anne.getByRole("button", { name: "Publier" }).click();
    await expect(anne.getByText("Voici mon premier logo animé, vos avis ?")).toBeVisible();

    // Le formateur répond et épingle.
    await theo.reload();
    const post = theo.locator("[id^=post-]").filter({ hasText: "Voici mon premier logo animé" });
    await post.getByRole("button", { name: "Répondre" }).click();
    await post.getByLabel("Répondre").fill("Super début ! Adoucis l'arrivée du logo.");
    await post.getByRole("button", { name: "Envoyer la réponse" }).click();
    await expect(post.getByText("Super début ! Adoucis l'arrivée du logo.")).toBeVisible();
    await post.getByRole("button", { name: "Actions du message" }).click();
    await theo.getByRole("menuitem", { name: "Épingler" }).click();
    await expect(post.getByText("Épinglé")).toBeVisible();

    // L'élève voit la réponse (et le compteur).
    await anne.reload();
    const own = anne.locator("[id^=post-]").filter({ hasText: "Voici mon premier logo animé" });
    await expect(own.getByText("1 réponse")).toBeVisible();
    await expect(own.getByText("Super début ! Adoucis l'arrivée du logo.")).toBeVisible();
    await expect(own.getByText("Formateur", { exact: true })).toBeVisible();
  } finally {
    await theo.goto("/admin/communaute");
    theo.once("dialog", (dialog) => dialog.accept());
    await theo.getByRole("button", { name: "Fermer la communauté" }).click();
    await expect(theo.getByRole("button", { name: "Ouvrir la communauté" })).toBeVisible();
  }
});
