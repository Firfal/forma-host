import { expect, test } from "@playwright/test";
import { ANNE, login, THEO } from "./helpers";

/** « AAAA-MM-JJTHH:MM » (heure locale du navigateur) dans `minutes` minutes. */
function localInput(minutes: number) {
  const date = new Date(Date.now() + minutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test("directs : le formateur programme un direct, l'élève le rejoint et l'ajoute à son agenda", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const theo = await browser.newPage();
  await login(theo, THEO);
  await theo.goto("/admin/formations/after-effects/directs");
  await theo.getByLabel("Titre").fill("Questions-réponses du mois");
  await theo.getByLabel("Date et heure").fill(localInput(10));
  await theo.getByLabel("Lien de connexion").fill("https://meet.google.com/abc-defg-hij");
  await theo.getByRole("button", { name: "Programmer le direct" }).click();
  await expect(theo.getByText("Direct programmé : tes élèves sont prévenus")).toBeVisible();
  await expect(theo.getByText("Bientôt")).toBeVisible();

  try {
    const anne = await browser.newPage();
    await login(anne, ANNE);
    // « Mes formations » : bandeau du prochain direct, déjà rejoignable (dans 10 min).
    await anne.goto("/formations");
    await expect(anne.getByText("Prochain direct : Questions-réponses du mois")).toBeVisible();
    await expect(anne.getByRole("link", { name: "Rejoindre" })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );

    await anne.goto("/formations/after-effects");
    const lives = anne.locator("#directs");
    await expect(lives.getByText("Questions-réponses du mois")).toBeVisible();
    await expect(lives.getByRole("link", { name: "Rejoindre le direct" })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );
    const download = anne.waitForEvent("download");
    await lives.getByRole("button", { name: "Ajouter à mon agenda" }).click();
    expect((await download).suggestedFilename()).toBe("direct.ics");
  } finally {
    await theo.goto("/admin/formations/after-effects/directs");
    theo.once("dialog", (dialog) => dialog.accept());
    await theo
      .getByRole("button", { name: "Supprimer le direct Questions-réponses du mois" })
      .click();
    await expect(theo.getByText("Aucun direct programmé")).toBeVisible();
  }
});
