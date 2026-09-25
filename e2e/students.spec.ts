import { expect, test } from "@playwright/test";
import { ANNE, login, mailsTo, stubVimeo, THEO } from "./helpers";

test("l'élève suit sa formation, termine une leçon et commente", async ({ page }) => {
  await login(page, ANNE);
  await expect(page.getByText("3 sur 15 terminés")).toBeVisible();

  await page.goto("/formations/after-effects/l4");
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page).toHaveURL(/\/l5$/);
  await expect(page.getByText("4 sur 15 terminés")).toBeVisible();

  await page.goto("/formations/after-effects/l3");
  await expect(page.getByText("Créateur")).toBeVisible();
  await page.getByPlaceholder("Ajouter un commentaire").fill("Merci, ça marche avec Fn !");
  await page.getByRole("button", { name: "Publier" }).click();
  await expect(
    page.getByRole("paragraph").filter({ hasText: "Merci, ça marche avec Fn !" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Ajouter un commentaire")).toHaveValue("");

  // Pas d'accès à l'espace formateur ni aux formations non achetées.
  await page.goto("/admin");
  await expect(page.getByText("Espace réservé aux formateurs")).toBeVisible();
  await page.goto("/formations/inexistante");
  await expect(page.getByText("pas (encore) accès")).toBeVisible();
});

test("invitation : le formateur donne l'accès, l'élève active son compte", async ({
  page,
  browser,
}) => {
  const email = `julie-${Date.now()}@exemple.fr`;
  await login(page, THEO);
  await page.goto("/admin/formations/after-effects");
  await page.getByRole("button", { name: "Donner l'accès" }).first().click();
  await page.fill("#invite-emails", `Julie Martin <${email}>`);
  await page.getByRole("button", { name: "Donner l'accès", exact: true }).last().click();
  await expect(page.getByText("1 élève ajouté")).toBeVisible();
  await expect(page.getByText("Julie Martin")).toBeVisible();

  const [mail] = await mailsTo(email);
  expect(mail.subject).toContain("Bienvenue");
  const token = mail.text.match(/\/bienvenue\/([A-Za-z0-9_-]+)/)?.[1];
  expect(token).toBeTruthy();

  const julie = await (await browser.newContext()).newPage();
  await stubVimeo(julie);
  await julie.goto(`/bienvenue/${token}`);
  await expect(julie.getByText("Bienvenue !")).toBeVisible();
  await julie.fill("#name", "Julie Martin");
  await julie.fill("#password", "julie12345");
  await julie.getByRole("button", { name: "Activer mon compte" }).click();
  await expect(julie).toHaveURL(/\/formations$/);
  await expect(julie.getByRole("link", { name: /Maîtriser After Effects/ }).last()).toBeVisible();

  await julie.goto(`/bienvenue/${token}`);
  await expect(julie.getByRole("heading", { name: "Compte déjà activé" })).toBeVisible();
});

test("le formateur répond depuis la page Commentaires", async ({ page }) => {
  await login(page, THEO);
  await page.goto("/admin/commentaires");
  await expect(page.getByText("Top ! Merci pour ta pédagogie")).toBeVisible();
  await page.getByRole("button", { name: "Répondre" }).first().click();
  await page.getByPlaceholder("Répondre").fill("Bonne continuation !");
  await page.getByRole("button", { name: "Publier" }).click();
  await expect(
    page.getByRole("paragraph").filter({ hasText: "Bonne continuation !" }),
  ).toBeVisible();
});
