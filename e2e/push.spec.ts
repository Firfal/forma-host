import { expect, test } from "@playwright/test";
import { ANNE, login, pushesSent, THEO } from "./helpers";

test("notifications push : le formateur active son appareil et reçoit les commentaires", async ({
  browser,
}) => {
  const theoContext = await browser.newContext({ permissions: ["notifications"] });
  const theo = await theoContext.newPage();
  await login(theo, THEO);
  await theo.goto("/compte");
  const toggle = theo.getByRole("switch", { name: "Notifications sur cet appareil" });
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(theo.getByText("Notifications activées sur cet appareil")).toBeVisible();
  await expect(toggle).toBeChecked();
  await theo.reload();
  await expect(toggle).toBeChecked();

  // Le service worker affiche un message FCM (format « data ») livré par Chrome.
  const cdp = await theoContext.newCDPSession(theo);
  const registrationId = new Promise<string>((resolve) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
      const registration = registrations.find((item) => !item.isDeleted);
      if (registration) resolve(registration.registrationId);
    });
  });
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(theo.url()).origin,
    registrationId: await registrationId,
    data: JSON.stringify({
      from: "1234",
      data: { title: "Nouvel élève", body: "Léa a rejoint", link: "/admin", tag: "t1" },
    }),
  });
  await expect
    .poll(() =>
      theo.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return (await registration.getNotifications()).map((item) => item.title);
      }),
    )
    .toEqual(["Nouvel élève"]);

  // Un élève commente : la notification part aussi en push sur l'appareil de Théo.
  const text = `Question push ${Date.now()}`;
  const anne = await browser.newPage();
  await login(anne, ANNE);
  await anne.goto("/formations/after-effects/l3");
  await anne.getByPlaceholder("Ajouter un commentaire").fill(text);
  await anne.getByRole("button", { name: "Publier" }).click();
  await expect(anne.getByRole("paragraph").filter({ hasText: text })).toBeVisible();

  await expect
    .poll(async () => (await pushesSent()).filter((push) => push.title.includes("a commenté")))
    .toHaveLength(1);
  const [push] = (await pushesSent()).filter((item) => item.title.includes("a commenté"));
  expect(push.tokens[0]).toMatch(/^emulateur-/);
  expect(push.link).toMatch(/^\/formations\/after-effects\/l3#comment-/);

  await toggle.click();
  await expect(theo.getByText("Notifications désactivées sur cet appareil")).toBeVisible();
  await expect(toggle).not.toBeChecked();
});

test("notifications push : navigateur sans autorisation", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, ANNE);
  await page.goto("/compte");
  await expect(page.getByText("Réponses à tes commentaires")).toBeVisible();
  const toggle = page.getByRole("switch", { name: "Notifications sur cet appareil" });
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(page.getByText("Notifications refusées")).toBeVisible();
  await expect(toggle).not.toBeChecked();
});
