import { expect, test, type Page } from "@playwright/test";
import { login, stubVimeo, THEO } from "./helpers";

async function saveSalesSettings(page: Page, invoicing: RegExp, unpaid: RegExp) {
  await page.goto("/admin/parametres#paiements");
  const card = page.locator("div.rounded-card", {
    has: page.getByRole("heading", { name: "Factures et impayés" }),
  });
  await card.getByRole("radio", { name: invoicing }).check();
  await card.getByRole("radio", { name: unpaid }).check();
  await card.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Réglages de vente enregistrés")).toBeVisible();
  return card;
}

test("factures et impayés : l'école confie ses factures à Stripe, l'acheteur les retrouve", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await login(page, THEO);
  const card = await saveSalesSettings(
    page,
    /Stripe établit mes factures/,
    /Dès l'échéance impayée/,
  );
  await expect(card.getByText(/plateforme agréée/)).toBeVisible();
  await page.reload();
  await expect(card.getByRole("radio", { name: /Stripe établit mes factures/ })).toBeChecked();
  await expect(card.getByRole("radio", { name: /Dès l'échéance impayée/ })).toBeChecked();

  // Vente directe (Stripe relié par le scénario de paiement).
  await page.goto("/admin/formations/after-effects/vente");
  await page.fill("#course-price", "97");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Prix enregistré")).toBeVisible();

  const buyer = await (await browser.newContext()).newPage();
  await stubVimeo(buyer);
  await buyer.goto("/inscription");
  await buyer.fill("#name", "Inès Morel");
  await buyer.fill("#email", `ines-${Date.now()}@exemple.fr`);
  await buyer.fill("#password", "ines12345");
  await buyer.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(buyer).toHaveURL(/\/formations$/);
  await buyer.goto("/ecole-motion/maitriser-after-effects");
  await buyer.getByRole("button", { name: /97/ }).first().click();
  const order = buyer.getByRole("dialog", { name: "Ta commande" });
  await order.getByRole("checkbox").check();
  await order.getByRole("button", { name: "Continuer vers le paiement" }).click();
  await expect(buyer.getByText("Merci pour ton achat !")).toBeVisible();

  // Facture établie par Stripe (pas de facture Forma Host).
  await buyer.goto("/compte");
  const purchases = buyer.locator("div.rounded-card", {
    has: buyer.getByRole("heading", { name: "Mes achats" }),
  });
  await expect(purchases.getByText(/Facture DEMO-/)).toBeVisible();
  await expect(purchases.getByRole("link", { name: "Facture" })).toHaveCount(0);

  // Retour aux réglages par défaut et vente directe désactivée (scénarios suivants).
  await page.goto("/admin/formations/after-effects/vente");
  await page.fill("#course-price", "");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Vente directe désactivée")).toBeVisible();
  await saveSalesSettings(page, /Forma Host établit mes factures/, /Quand Stripe arrête/);
});
