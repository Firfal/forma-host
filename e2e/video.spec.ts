import { expect, test } from "@playwright/test";
import { login, THEO } from "./helpers";

test("vidéo Vimeo collée dans une leçon existante : visible sur la page de la leçon", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page, THEO);

  // Formation « test » > chapitre > leçon enregistrée d'abord avec du texte seulement.
  await page.goto("/admin/formations");
  await page.getByRole("button", { name: "Nouvelle formation" }).click();
  await page.fill("#course-title", "test");
  await page.getByRole("button", { name: "Créer la formation" }).click();
  await expect(page).toHaveURL(/\/contenu$/);
  await page.getByRole("button", { name: "Créer le premier chapitre" }).click();
  const title = page.getByRole("textbox", { name: "Titre" });
  await title.fill("test1");
  await title.press("Enter");
  await expect(page.getByText("Enregistré")).toBeVisible();
  await page.locator("button", { hasText: "Nouvelle leçon" }).last().click();
  await expect(page).toHaveURL(/\/lecons\//);
  const editorUrl = page.url();
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("test");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Leçon enregistrée")).toBeVisible();

  // Puis le lien est collé (presse-papiers) et la leçon enregistrée.
  await page.goto(editorUrl);
  await page.evaluate(() =>
    navigator.clipboard.writeText("https://vimeo.com/749257095?fl=pl&fe=sh"),
  );
  await page.locator("#vimeo-url").click();
  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.getByText("Vimeo #749257095")).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Leçon enregistrée")).toBeVisible();

  const [, courseId, lessonId] = editorUrl.match(/formations\/([^/]+)\/lecons\/([^/?#]+)/) ?? [];
  await page.goto(`/formations/${courseId}/${lessonId}`);
  await expect(page.locator('iframe[src*="player.vimeo.com/video/749257095"]')).toBeAttached();
});
