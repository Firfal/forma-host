import { expect, test } from "@playwright/test";
import { ANNE, login, THEO } from "./helpers";

test("annonces : le formateur publie, l'élève est notifié et la lit sur la formation", async ({
  browser,
}) => {
  const theo = await browser.newPage();
  await login(theo, THEO);
  await theo.goto("/admin/formations/after-effects/annonces");
  await theo.getByRole("button", { name: "Publier l'annonce" }).click();
  await expect(theo.getByText("Titre requis")).toBeVisible();
  await theo.getByLabel("Titre").fill("Nouveau module : les expressions");
  await theo.getByLabel("Message").fill("Trois nouvelles leçons sont en ligne.");
  await theo.getByRole("button", { name: "Publier l'annonce" }).click();
  await expect(theo.getByText(/Annonce publiée : \d+ élèves? prévenus?/)).toBeVisible();
  await expect(
    theo.getByRole("listitem").filter({ hasText: "Nouveau module : les expressions" }),
  ).toBeVisible();

  const anne = await browser.newPage();
  await login(anne, ANNE);
  await anne.goto("/formations/after-effects");
  await expect(anne.getByRole("heading", { name: "Annonces" })).toBeVisible();
  await expect(anne.getByText("Nouveau module : les expressions")).toBeVisible();
  await expect(anne.getByText("Trois nouvelles leçons sont en ligne.")).toBeVisible();
  await anne
    .getByRole("button", { name: /Notifications/ })
    .first()
    .click();
  await expect(
    anne.getByRole("menuitem", { name: /Nouveau module : les expressions/ }),
  ).toBeVisible();
});
