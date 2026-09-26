import { expect, test } from "@playwright/test";
import { ANNE, login, mailsTo, THEO } from "./helpers";

test("chat : l'élève écrit au formateur, qui répond, archive puis bloque", async ({ browser }) => {
  const anne = await browser.newPage();
  await login(anne, ANNE);
  await anne.goto("/formations/after-effects");
  await anne.getByRole("button", { name: "Écrire au formateur" }).click();
  await expect(anne).toHaveURL(/\/messages\/[\w-]+_[\w-]+$/);
  await expect(anne.getByRole("heading", { name: "Ecole Motion" })).toBeVisible();

  const question = "Comment passer d'une image clé à l'autre sans la souris ?";
  const input = anne.getByRole("textbox", { name: "Message" });
  await input.fill("Bonjour Théo,");
  await input.press("Enter");
  await input.fill(question);
  await input.press("Enter");
  await expect(anne.getByText(question)).toBeVisible();
  await expect(input).toHaveValue("");

  // Côté formateur : badge non lu, conversation, réponse.
  const theo = await browser.newPage();
  await login(theo, THEO);
  const nav = theo.getByRole("navigation", { name: "Navigation principale" });
  await expect(nav.getByRole("link", { name: /Messages.*1 non lu/ })).toBeVisible();
  await nav
    .getByRole("link", { name: /^Messages/ })
    .first()
    .click();
  await theo.getByRole("link", { name: /Anne/ }).click();
  await expect(theo.getByText(question)).toBeVisible();
  await expect(theo.getByText("Bonjour Théo,")).toBeVisible();
  await expect(nav.getByRole("link", { name: /Messages.*non lu/ })).toHaveCount(0);

  const reply = "Sélectionne la propriété puis utilise J et K.";
  await theo.getByRole("textbox", { name: "Message" }).fill(reply);
  await theo.getByRole("button", { name: "Envoyer" }).click();

  // L'élève voit la réponse en direct, avec le badge « Créateur », et reçoit un email.
  await expect(anne.getByText(reply)).toBeVisible();
  await expect(anne.getByText("Créateur")).toBeVisible();
  await expect
    .poll(async () => (await mailsTo(ANNE.email)).map((mail) => mail.subject))
    .toContain("Nouveau message de Ecole Motion");

  // Archivage : la conversation quitte la liste active.
  await theo.getByRole("button", { name: "Archiver" }).click();
  await expect(theo.getByText("Conversation archivée")).toBeVisible();
  const list = theo.locator("aside, main").getByRole("link", { name: /Anne/ });
  await expect(list).toHaveCount(0);
  await theo.getByRole("button", { name: "Actives" }).click();
  await theo.getByRole("menuitem", { name: "Archivées" }).click();
  await expect(list).toHaveCount(1);

  // Blocage : l'élève ne peut plus écrire.
  theo.once("dialog", (dialog) => void dialog.accept());
  await theo.getByRole("button", { name: "Bloquer l'élève" }).click();
  await expect(theo.getByText("Conversation bloquée")).toBeVisible();
  await expect(anne.getByText("L'école a fermé cette conversation.")).toBeVisible();
  await expect(anne.getByRole("textbox", { name: "Message" })).toHaveCount(0);

  await theo.getByRole("button", { name: "Débloquer l'élève" }).click();
  await expect(anne.getByRole("textbox", { name: "Message" })).toBeVisible();
});
