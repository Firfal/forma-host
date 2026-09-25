import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function storage(uid: string | null, claims: Record<string, unknown> = {}) {
  if (!uid) return env.unauthenticatedContext().storage();
  return env.authenticatedContext(uid, claims).storage();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-forma",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "courses/c1"), { creatorId: "theo", status: "published" });
    await setDoc(doc(ctx.firestore(), "enrollments/c1_anne"), { status: "active", uid: "anne" });
    await setDoc(doc(ctx.firestore(), "enrollments/c1_revoque"), {
      status: "revoked",
      uid: "revoque",
    });
    await uploadBytes(ref(ctx.storage(), "courses/c1/lessons/l1/attachments/projet.pdf"), PDF, {
      contentType: "application/pdf",
    });
  });
});

describe("storage", () => {
  it("le formateur téléverse la miniature, pas un élève", async () => {
    const path = "courses/c1/thumbnail/cover.png";
    await assertSucceeds(
      uploadBytes(ref(storage("theo"), path), PNG, { contentType: "image/png" }),
    );
    await assertFails(uploadBytes(ref(storage("anne"), path), PNG, { contentType: "image/png" }));
  });

  it("la miniature doit être une image", async () => {
    await assertFails(
      uploadBytes(ref(storage("theo"), "courses/c1/thumbnail/x.pdf"), PDF, {
        contentType: "application/pdf",
      }),
    );
  });

  it("les pièces jointes sont réservées aux inscrits actifs", async () => {
    const path = "courses/c1/lessons/l1/attachments/projet.pdf";
    await assertSucceeds(getBytes(ref(storage("anne"), path)));
    await assertSucceeds(getBytes(ref(storage("theo"), path)));
    await assertFails(getBytes(ref(storage("revoque"), path)));
    await assertFails(getBytes(ref(storage("inconnu"), path)));
    await assertFails(getBytes(ref(storage(null), path)));
  });

  it("avatar : chacun le sien", async () => {
    await assertSucceeds(
      uploadBytes(ref(storage("anne"), "users/anne/avatar/a.png"), PNG, {
        contentType: "image/png",
      }),
    );
    await assertFails(
      uploadBytes(ref(storage("inconnu"), "users/anne/avatar/a.png"), PNG, {
        contentType: "image/png",
      }),
    );
  });
});
