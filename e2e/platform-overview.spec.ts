import { expect, test } from "@playwright/test";
import { login, THEO } from "./helpers";

test("plateforme : vue d'ensemble des écoles", async ({ page }) => {
  await login(page, THEO);
  await page.getByRole("link", { name: "Vue d'ensemble" }).click();
  await expect(page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible();
  await expect(page.getByText("Écoles", { exact: true }).first()).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Ecole Motion" });
  await expect(row).toBeVisible();
  await expect(row.getByText(/Paiements actifs|Stripe à finaliser|Sans Stripe/)).toBeVisible();
});
