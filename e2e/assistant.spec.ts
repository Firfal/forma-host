import { expect, test } from "@playwright/test";
import { ANNE, login, THEO } from "./helpers";

test("assistant IA : la plateforme l'active, le formateur l'ouvre sur sa formation, l'élève pose une question", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const theo = await browser.newPage();
  await login(theo, THEO);
  await theo.goto("/plateforme");
  await theo.getByLabel("Clé API Anthropic").fill("sk-ant-api03-demonstrationkey0000000000");
  await theo.getByRole("button", { name: "Activer l'assistant" }).click();
  await expect(theo.getByText("sk-ant-…0000")).toBeVisible();

  await theo.goto("/admin/formations/after-effects/details");
  await theo.getByRole("radio", { name: /^Activé/ }).check();
  await theo.getByRole("button", { name: "Enregistrer" }).click();
  await expect(theo.getByText("Détails enregistrés")).toBeVisible();

  try {
    const anne = await browser.newPage();
    await login(anne, ANNE);
    await anne.goto("/formations/after-effects/l2");
    await anne.getByRole("button", { name: /Assistant de la formation/ }).click();
    await anne
      .getByLabel("Ta question à l'assistant")
      .fill("Où se trouve le panneau Composition ?");
    await anne.getByRole("button", { name: "Envoyer la question" }).click();
    await expect(
      anne.getByText("Réponse de démonstration : Où se trouve le panneau Composition ?"),
    ).toBeVisible();
    await expect(anne.getByText(/questions restantes aujourd'hui/)).toBeVisible();
  } finally {
    await theo.goto("/admin/formations/after-effects/details");
    await theo.getByRole("radio", { name: /^Désactivé/ }).check();
    await theo.getByRole("button", { name: "Enregistrer" }).click();
    await expect(theo.getByText("Détails enregistrés")).toBeVisible();
    await theo.goto("/plateforme");
    theo.once("dialog", (dialog) => dialog.accept());
    await theo.getByRole("button", { name: "Désactiver" }).click();
    await expect(theo.getByRole("button", { name: "Activer l'assistant" })).toBeVisible();
  }
});
