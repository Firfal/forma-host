import { expect, test } from "@playwright/test";
import { login, stubVimeo, THEO } from "./helpers";

test("inscription formateur : demande, validation par la plateforme, école créée", async ({
  page,
  browser,
}) => {
  const email = `lea-${Date.now()}@exemple.fr`;
  const slug = `studio-lea-${Date.now()}`;

  // Léa crée un compte puis demande un espace formateur.
  await stubVimeo(page);
  await page.goto("/inscription");
  await page.fill("#name", "Léa Martin");
  await page.fill("#email", email);
  await page.fill("#password", "lea12345");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/formations$/);
  await page.getByRole("link", { name: "Devenir formateur" }).click();
  await page.fill("#request-school", "Studio Léa");
  await page.fill("#request-slug", slug);
  await page.fill("#request-message", "Formations Blender pour débutants.");
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.getByText("Demande en cours d'examen")).toBeVisible();

  // Théo, administrateur de la plateforme, accepte la demande.
  const admin = await (await browser.newContext()).newPage();
  await login(admin, THEO);
  await admin.getByRole("link", { name: "Demandes formateurs" }).click();
  await expect(admin.getByText("Formations Blender pour débutants.")).toBeVisible();
  await admin.getByRole("button", { name: "Accepter et créer l'école" }).click();
  await expect(admin.getByText("« Studio Léa » est créée")).toBeVisible();

  // Léa a maintenant son espace formateur (jeton rechargé automatiquement).
  await expect(page.getByText("Tu as un espace formateur")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "Ouvrir mon espace formateur" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/parametres");
  await expect(page.locator("#school-name")).toHaveValue("Studio Léa");
  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { name: "Studio Léa" })).toBeVisible();
});
