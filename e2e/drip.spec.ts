import { expect, test } from "@playwright/test";
import { ANNE, login, THEO } from "./helpers";

test("ouverture progressive : dans l'ordre, la leçon suivante attend la précédente", async ({
  browser,
}) => {
  const theo = await browser.newPage();
  await login(theo, THEO);
  const setDrip = async (label: string) => {
    await theo.goto("/admin/formations/after-effects/details");
    await theo.getByRole("radio", { name: new RegExp(label) }).check();
    await theo.getByRole("button", { name: "Enregistrer" }).click();
    await expect(theo.getByText("Détails enregistrés")).toBeVisible();
  };
  await setDrip("Dans l'ordre");

  try {
    // Anne a terminé les 3 premières leçons : la 4e est ouverte, la 5e attend la 4e.
    const anne = await browser.newPage();
    await login(anne, ANNE);
    await anne.goto("/formations/after-effects/l5");
    await expect(
      anne.getByText("Cette leçon s'ouvre quand la précédente est terminée."),
    ).toBeVisible();
    await anne.getByRole("link", { name: /Reprendre « / }).click();
    await expect(anne).toHaveURL(/\/formations\/after-effects\/l4$/);
    await expect(anne.getByRole("button", { name: "Terminer" })).toBeVisible();
  } finally {
    await setDrip("Tout de suite");
  }
});
