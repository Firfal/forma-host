import { expect, test } from "@playwright/test";
import { ANNE, login, THEO } from "./helpers";

test("co-gestion : un administrateur invité gère l'école, puis est retiré", async ({
  page,
  browser,
}) => {
  await login(page, THEO);
  await page.goto("/admin/parametres");
  await expect(page.getByText("Propriétaire", { exact: true })).toBeVisible();
  await page.fill("#team-email", ANNE.email);
  await page.getByRole("button", { name: "Inviter" }).click();
  await expect(page.getByText(`${ANNE.email} fait maintenant partie de l'équipe.`)).toBeVisible();
  await expect(page.getByText("Administrateur", { exact: true })).toBeVisible();

  // Anne (déjà élève) se connecte : espace Admin de l'école de Théo.
  const anne = await (await browser.newContext()).newPage();
  await login(anne, ANNE);
  await anne.goto("/admin/formations");
  await expect(anne.getByText("Maîtriser After Effects").first()).toBeVisible();
  await expect(anne.getByRole("complementary").getByText("Ecole Motion")).toBeVisible();
  await anne.goto("/admin/parametres");
  await expect(anne.locator("#school-name")).toHaveValue("Ecole Motion");
  await expect(anne.getByText("sont réglés par le propriétaire")).toBeVisible();
  await expect(anne.locator("#team-email")).toHaveCount(0);

  // Théo la retire : Anne perd l'accès à l'administration.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Retirer" }).first().click();
  await expect(page.getByText(`${ANNE.email} a été retiré de l'équipe`)).toBeVisible();
  await anne.waitForTimeout(3000);
  await anne.goto("/admin/formations");
  await expect(anne.getByText("Espace réservé aux formateurs")).toBeVisible();
});
