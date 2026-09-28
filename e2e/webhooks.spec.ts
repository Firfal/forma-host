import { expect, test } from "@playwright/test";
import { login, THEO } from "./helpers";

test("intégrations : le formateur ajoute un webhook Zapier et le teste", async ({ page }) => {
  await login(page, THEO);
  await page.goto("/admin/parametres");
  await page.getByLabel("Adresse du webhook").fill("https://hooks.zapier.com/hooks/catch/1/demo");
  await page.getByRole("checkbox", { name: "Certificat délivré" }).check();
  await page.getByRole("button", { name: "Ajouter le webhook" }).click();
  await expect(page.getByText("https://hooks.zapier.com/hooks/catch/1/demo")).toBeVisible();
  await expect(page.getByText("Jamais utilisé")).toBeVisible();
  await page.getByRole("button", { name: "Tester", exact: true }).click();
  await expect(page.getByText("Test reçu (200)")).toBeVisible();
  await expect(page.getByText(/^OK · /)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: "Supprimer le webhook https://hooks.zapier.com/hooks/catch/1/demo",
    })
    .click();
  await expect(page.getByText("https://hooks.zapier.com/hooks/catch/1/demo")).toHaveCount(0);
});
