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
  // Premier passage : Next.js (mode dev) compile l'espace connecté, ce qui peut être long.
  await expect(page).toHaveURL(/\/(admin|formations)$/, { timeout: 60_000 });
}

/** Emails écrits dans la collection `mail` de l'émulateur (SMTP simulé en local). */
export async function mailsTo(
  email: string,
): Promise<{ text: string; subject: string; state: string | null }[]> {
  const response = await fetch(
    "http://127.0.0.1:8080/v1/projects/demo-forma/databases/(default)/documents/mail?pageSize=300",
    { headers: { Authorization: "Bearer owner" } },
  );
  const body = (await response.json()) as {
    documents?: {
      fields: {
        to: { stringValue: string };
        message: { mapValue: { fields: Record<string, { stringValue: string }> } };
        delivery?: { mapValue: { fields: { state?: { stringValue: string } } } };
      };
    }[];
  };
  return (body.documents ?? [])
    .filter((doc) => doc.fields.to.stringValue === email)
    .map((doc) => ({
      text: doc.fields.message.mapValue.fields.text.stringValue,
      subject: doc.fields.message.mapValue.fields.subject.stringValue,
      state: doc.fields.delivery?.mapValue.fields.state?.stringValue ?? null,
    }));
}

/** Notifications push envoyées (FCM simulé en local : collection `_fakePush`). */
export async function pushesSent(): Promise<{ tokens: string[]; title: string; link: string }[]> {
  const response = await fetch(
    "http://127.0.0.1:8080/v1/projects/demo-forma/databases/(default)/documents/_fakePush?pageSize=300",
    { headers: { Authorization: "Bearer owner" } },
  );
  const body = (await response.json()) as {
    documents?: {
      fields: {
        tokens: { arrayValue: { values?: { stringValue: string }[] } };
        data: { mapValue: { fields: Record<string, { stringValue: string }> } };
      };
    }[];
  };
  return (body.documents ?? []).map((doc) => ({
    tokens: (doc.fields.tokens.arrayValue.values ?? []).map((value) => value.stringValue),
    title: doc.fields.data.mapValue.fields.title.stringValue,
    link: doc.fields.data.mapValue.fields.link.stringValue,
  }));
}

const FIRESTORE = "http://127.0.0.1:8080/v1/projects/demo-forma/databases/(default)/documents";
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };

/** Identifiant d'une école de démo, d'après son adresse publique. */
export async function schoolIdBySlug(slug: string): Promise<string> {
  const response = await fetch(`${FIRESTORE}:runQuery`, {
    method: "POST",
    headers: OWNER,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "creators" }],
        where: {
          fieldFilter: { field: { fieldPath: "slug" }, op: "EQUAL", value: { stringValue: slug } },
        },
      },
    }),
  });
  const [row] = (await response.json()) as { document?: { name: string } }[];
  if (!row?.document) throw new Error(`École ${slug} introuvable`);
  return row.document.name.split("/").pop()!;
}

/** Informations légales de démo (factures, pages légales) écrites directement dans l'émulateur. */
export async function publishLegalInfo(slug: string) {
  const id = await schoolIdBySlug(slug);
  const text = (value: string) => ({ stringValue: value });
  await fetch(`${FIRESTORE}/creators/${id}/legal/info`, {
    method: "PATCH",
    headers: OWNER,
    body: JSON.stringify({
      fields: {
        companyName: text("Ecole Motion"),
        legalForm: text("Entreprise individuelle"),
        siret: text("12345678900012"),
        address: text("1 rue de la Paix, 75002 Paris"),
        vatMode: text("franchise"),
        vatNumber: { nullValue: null },
        publisherName: text("Théo Robert"),
        contactEmail: text("contact@ecolemotion.com"),
        phone: { nullValue: null },
        mediatorName: text("CM2C"),
        mediatorUrl: { nullValue: null },
        refundDays: { integerValue: "0" },
        accessMonths: { nullValue: null },
        extraTerms: { nullValue: null },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    }),
  });
}

/** Marque toutes les leçons visibles d'une formation comme terminées pour un élève. */
export async function completeCourseFor(email: string, courseId: string) {
  const course = (await (
    await fetch(`${FIRESTORE}/courses/${courseId}`, { headers: OWNER })
  ).json()) as {
    fields: {
      items: {
        arrayValue: {
          values: {
            mapValue: { fields: Record<string, { stringValue?: string; booleanValue?: boolean }> };
          }[];
        };
      };
    };
  };
  const lessonIds = course.fields.items.arrayValue.values
    .map((item) => item.mapValue.fields)
    .filter((item) => item.kind?.stringValue === "lesson" && !item.hidden?.booleanValue)
    .map((item) => item.id.stringValue!);
  const response = await fetch(`${FIRESTORE}:runQuery`, {
    method: "POST",
    headers: OWNER,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "enrollments" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "email" },
            op: "EQUAL",
            value: { stringValue: email },
          },
        },
      },
    }),
  });
  const rows = (await response.json()) as {
    document?: { name: string; fields: { courseId: { stringValue: string } } };
  }[];
  const enrollment = rows.find((row) => row.document?.fields.courseId.stringValue === courseId);
  if (!enrollment?.document) throw new Error(`${email} n'est pas inscrit à ${courseId}`);
  const path = enrollment.document.name.split("/documents/")[1];
  await fetch(`${FIRESTORE}/${path}?updateMask.fieldPaths=progress.completedLessonIds`, {
    method: "PATCH",
    headers: OWNER,
    body: JSON.stringify({
      fields: {
        progress: {
          mapValue: {
            fields: {
              completedLessonIds: {
                arrayValue: { values: lessonIds.map((id) => ({ stringValue: id })) },
              },
            },
          },
        },
      },
    }),
  });
}
