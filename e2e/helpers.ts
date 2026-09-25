import { expect, type Page } from "@playwright/test";

export const THEO = { email: "theo@ecolemotion.com", password: "motion123" };
export const ANNE = { email: "anne@exemple.fr", password: "eleve123" };

/** Le lecteur Vimeo est remplacé par une page vide (pas de réseau en test). */
export async function stubVimeo(page: Page) {
  await page.route(/(player\.)?vimeo\.com|vimeocdn\.com/, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<html><body></body></html>" }),
  );
}

export async function login(page: Page, user: { email: string; password: string }) {
  await stubVimeo(page);
  await page.goto("/connexion");
  await page.fill("#email", user.email);
  await page.fill("#password", user.password);
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/(admin|formations)$/);
}

/** Emails écrits dans la collection `mail` de l'émulateur (non envoyés en local). */
export async function mailsTo(email: string): Promise<{ text: string; subject: string }[]> {
  const response = await fetch(
    "http://127.0.0.1:8080/v1/projects/demo-forma/databases/(default)/documents/mail?pageSize=300",
    { headers: { Authorization: "Bearer owner" } },
  );
  const body = (await response.json()) as {
    documents?: {
      fields: {
        to: { stringValue: string };
        message: { mapValue: { fields: Record<string, { stringValue: string }> } };
      };
    }[];
  };
  return (body.documents ?? [])
    .filter((doc) => doc.fields.to.stringValue === email)
    .map((doc) => ({
      text: doc.fields.message.mapValue.fields.text.stringValue,
      subject: doc.fields.message.mapValue.fields.subject.stringValue,
    }));
}
