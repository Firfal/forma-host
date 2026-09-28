import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "demo-forma";
const THEO = "theo";
const OTHER_CREATOR = "autre";
const ANNE = "anne";
const REVOKED = "revoque";
const STRANGER = "inconnu";

let env: RulesTestEnvironment;

function db(uid: string | null, claims: Record<string, unknown> = {}): Firestore {
  // rules-unit-testing renvoie une instance « compat », compatible avec l'API modulaire.
  const context = uid
    ? env.authenticatedContext(uid, { email: `${uid}@test.fr`, ...claims })
    : env.unauthenticatedContext();
  return context.firestore() as unknown as Firestore;
}

const creatorDb = () => db(THEO, { creator: true });
const COADMIN = "quentin";
/** Co-administrateur de l'école de Théo (custom claim `schools`). */
const coAdminDb = () => db(COADMIN, { creator: true, schools: [THEO] });

function courseData(overrides: Record<string, unknown> = {}) {
  return {
    creatorId: THEO,
    title: "Maîtriser After Effects",
    slug: "maitriser-after-effects",
    description: null,
    summary: "",
    thumbnailUrl: null,
    status: "published",
    visibility: "visible",
    commentsMode: "active",
    items: [
      { id: "l1", kind: "lesson", title: "Intro", isPreview: true },
      { id: "l2", kind: "lesson", title: "Interface" },
    ],
    outlineVersion: 0,
    salesPage: null,
    createdAt: Timestamp.fromMillis(1_700_000_000_000),
    updatedAt: Timestamp.fromMillis(1_700_000_000_000),
    ...overrides,
  };
}

function lessonData(overrides: Record<string, unknown> = {}) {
  return {
    creatorId: THEO,
    courseId: "c1",
    courseStatus: "published",
    isPreview: false,
    title: "Interface",
    video: {
      provider: "vimeo",
      id: "123456",
      hash: "abc",
      title: null,
      durationSec: 60,
      thumbnailUrl: null,
    },
    thumbnailUrl: null,
    body: null,
    links: [],
    attachments: [],
    updatedAt: Timestamp.now(),
    ...overrides,
  };
}

function enrollmentData(uid: string, status = "active") {
  return {
    courseId: "c1",
    creatorId: THEO,
    uid,
    email: `${uid}@test.fr`,
    displayName: null,
    source: "invite",
    orderId: null,
    status,
    joinedAt: Timestamp.now(),
    progress: { completedLessonIds: [], lastLessonId: null, lastActivityAt: null },
  };
}

function commentData(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    courseId: "c1",
    creatorId: THEO,
    lessonId: "l2",
    authorUid: uid,
    authorName: "Anne",
    authorAvatarUrl: null,
    body: "Super leçon !",
    parentId: null,
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    await setDoc(doc(admin, "creators/theo"), { name: "Ecole Motion", slug: "ecole-motion" });
    await setDoc(doc(admin, "courses/c1"), courseData());
    await setDoc(doc(admin, "courses/draft"), courseData({ status: "draft" }));
    await setDoc(
      doc(admin, "courses/c1/lessons/l1"),
      lessonData({ isPreview: true, title: "Intro" }),
    );
    await setDoc(doc(admin, "courses/c1/lessons/l2"), lessonData());
    await setDoc(doc(admin, "courses/c1/private/settings"), {
      welcomeEmail: { subject: "s", body: "b" },
    });
    await setDoc(doc(admin, "enrollments/c1_anne"), enrollmentData(ANNE));
    await setDoc(doc(admin, "enrollments/c1_revoque"), enrollmentData(REVOKED, "revoked"));
    await setDoc(doc(admin, "courses/c1/comments/root"), {
      ...commentData(ANNE),
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(admin, "courses/c1/comments/reply"), {
      ...commentData(THEO, { parentId: "root", authorName: "Théo" }),
      createdAt: Timestamp.now(),
    });
  });
});

describe("formations", () => {
  it("une formation publiée est publique, un brouillon non", async () => {
    await assertSucceeds(getDoc(doc(db(null), "courses/c1")));
    await assertFails(getDoc(doc(db(null), "courses/draft")));
    await assertSucceeds(getDoc(doc(creatorDb(), "courses/draft")));
  });

  it("un inscrit garde l'accès si la formation est dépubliée", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), "courses/c1"), { status: "draft" }),
    );
    await assertSucceeds(getDoc(doc(db(ANNE), "courses/c1")));
    await assertFails(getDoc(doc(db(STRANGER), "courses/c1")));
  });

  it("seul un formateur crée une formation, à son nom", async () => {
    const data = courseData({
      status: "draft",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(creatorDb(), "courses/new"), data));
    await assertFails(setDoc(doc(db(ANNE), "courses/new2"), { ...data, creatorId: ANNE }));
    await assertFails(setDoc(doc(db(OTHER_CREATOR, { creator: true }), "courses/new3"), data));
  });

  it("le plan ne change qu'avec outlineVersion + 1", async () => {
    const ref = doc(creatorDb(), "courses/c1");
    const newItems = [{ id: "l2", kind: "lesson", title: "Interface" }];
    await assertFails(updateDoc(ref, { items: newItems, updatedAt: serverTimestamp() }));
    await assertFails(
      updateDoc(ref, { items: newItems, outlineVersion: 2, updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(
      updateDoc(ref, { items: newItems, outlineVersion: 1, updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(updateDoc(ref, { title: "Nouveau titre", updatedAt: serverTimestamp() }));
  });

  it("personne d'autre ne modifie la formation", async () => {
    await assertFails(updateDoc(doc(db(ANNE), "courses/c1"), { title: "Piratée" }));
    await assertFails(
      updateDoc(doc(db(OTHER_CREATOR, { creator: true }), "courses/c1"), {
        title: "Piratée",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("les réglages privés sont réservés au formateur", async () => {
    await assertSucceeds(getDoc(doc(creatorDb(), "courses/c1/private/settings")));
    await assertFails(getDoc(doc(db(ANNE), "courses/c1/private/settings")));
  });

  it("le formateur liste ses formations", async () => {
    await assertSucceeds(
      getDocs(query(collection(creatorDb(), "courses"), where("creatorId", "==", THEO))),
    );
    await assertFails(getDocs(collection(db(ANNE), "courses")));
  });
});

describe("co-gestion d'une école", () => {
  it("un co-administrateur gère les formations, leçons, élèves et commentaires", async () => {
    const coadmin = coAdminDb();
    await assertSucceeds(getDoc(doc(coadmin, "courses/draft")));
    await assertSucceeds(
      updateDoc(doc(coadmin, "courses/c1"), {
        title: "Nouveau titre",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      setDoc(
        doc(coadmin, "courses/new"),
        courseData({ status: "draft", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
      ),
    );
    await assertSucceeds(
      setDoc(doc(coadmin, "courses/c1/lessons/l9"), lessonData({ updatedAt: serverTimestamp() })),
    );
    await assertSucceeds(getDoc(doc(coadmin, "courses/c1/private/settings")));
    await assertSucceeds(
      getDocs(query(collection(coadmin, "enrollments"), where("creatorId", "==", THEO))),
    );
    await assertSucceeds(
      getDocs(query(collectionGroup(coadmin, "comments"), where("creatorId", "==", THEO))),
    );
    await assertSucceeds(deleteDoc(doc(coadmin, "courses/c1/comments/root")));
  });

  it("équipe et réglages : lisibles par l'équipe, secrets jamais", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const admin = ctx.firestore();
      await setDoc(doc(admin, "creators/theo/members/quentin"), { role: "admin" });
      await setDoc(doc(admin, "creators/theo/private/mail"), { host: "smtp.gmail.com" });
      await setDoc(doc(admin, "creators/theo/secrets/mail"), { password: "v1:x" });
    });
    await assertSucceeds(getDoc(doc(coAdminDb(), "creators/theo/members/quentin")));
    await assertSucceeds(getDoc(doc(coAdminDb(), "creators/theo/private/mail")));
    await assertFails(getDoc(doc(coAdminDb(), "creators/theo/secrets/mail")));
    await assertFails(setDoc(doc(coAdminDb(), "creators/theo/members/intrus"), { role: "admin" }));
    await assertFails(getDoc(doc(db(ANNE), "creators/theo/members/quentin")));
  });

  it("un co-administrateur retiré (claims sans l'école) perd l'accès", async () => {
    const removed = db(COADMIN, { creator: false, schools: [] });
    await assertFails(getDoc(doc(removed, "courses/draft")));
    await assertFails(
      updateDoc(doc(removed, "courses/c1"), { title: "Piratée", updatedAt: serverTimestamp() }),
    );
  });

  it("pas de formation dans une école qui n'existe pas", async () => {
    const data = courseData({
      creatorId: OTHER_CREATOR,
      status: "draft",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await assertFails(setDoc(doc(db(OTHER_CREATOR, { creator: true }), "courses/fantome"), data));
  });
});

describe("demandes d'espace formateur", () => {
  const requestData = (uid: string, overrides: Record<string, unknown> = {}) => ({
    uid,
    email: `${uid}@test.fr`,
    displayName: "Léa",
    schoolName: "Studio Léa",
    slug: "studio-lea",
    message: "",
    status: "pending",
    createdAt: serverTimestamp(),
    ...overrides,
  });

  it("un utilisateur crée sa propre demande, en attente", async () => {
    await assertSucceeds(
      setDoc(doc(db(STRANGER), "creatorRequests/inconnu"), requestData(STRANGER)),
    );
    await assertFails(setDoc(doc(db(STRANGER), "creatorRequests/anne"), requestData(ANNE)));
    await assertFails(
      setDoc(doc(db(ANNE), "creatorRequests/anne"), requestData(ANNE, { status: "approved" })),
    );
    await assertFails(
      setDoc(doc(db(ANNE), "creatorRequests/anne"), requestData(ANNE, { email: "autre@test.fr" })),
    );
    // Un formateur a déjà une école.
    await assertFails(setDoc(doc(creatorDb(), "creatorRequests/theo"), requestData(THEO)));
  });

  it("lisible par son auteur et les administrateurs de la plateforme uniquement", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "creatorRequests/anne"), {
        ...requestData(ANNE),
        createdAt: Timestamp.now(),
      });
    });
    await assertSucceeds(getDoc(doc(db(ANNE), "creatorRequests/anne")));
    await assertSucceeds(
      getDocs(
        query(
          collection(db("admin", { platformAdmin: true }), "creatorRequests"),
          where("status", "==", "pending"),
        ),
      ),
    );
    await assertFails(getDoc(doc(creatorDb(), "creatorRequests/anne")));
    await assertFails(updateDoc(doc(db(ANNE), "creatorRequests/anne"), { status: "approved" }));
    await assertFails(deleteDoc(doc(db(ANNE), "creatorRequests/anne")));
  });
});

describe("paiements", () => {
  it("prix de la formation : centimes en euros, bornés", async () => {
    const ref = doc(creatorDb(), "courses/c1");
    await assertSucceeds(
      updateDoc(ref, { price: { amount: 19700, currency: "eur" }, updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(updateDoc(ref, { price: null, updatedAt: serverTimestamp() }));
    await assertFails(
      updateDoc(ref, { price: { amount: 50, currency: "eur" }, updatedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(ref, { price: { amount: 19700, currency: "usd" }, updatedAt: serverTimestamp() }),
    );
    // Paiement en 2, 3 ou 4 fois, à partir de 50 €.
    const price = (amount: number, installments: unknown) => ({
      price: { amount, currency: "eur", installments },
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(updateDoc(ref, price(19700, [3, 4])));
    await assertSucceeds(updateDoc(ref, price(1000, [])));
    await assertFails(updateDoc(ref, price(1000, [3])));
    await assertFails(updateDoc(ref, price(19700, [6])));
    await assertFails(updateDoc(ref, price(19700, "3")));
  });

  it("commandes, codes promo et compte Stripe : lecture équipe, écriture serveur", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const admin = ctx.firestore();
      await setDoc(doc(admin, "orders/cs_1"), { schoolId: THEO, courseId: "c1", email: "a@b.c" });
      await setDoc(doc(admin, "courses/c1/promoCodes/p1"), { code: "BIENVENUE" });
      await setDoc(doc(admin, "courses/c1/private/stripe"), { productId: "prod_1" });
    });
    await assertSucceeds(getDoc(doc(coAdminDb(), "orders/cs_1")));
    await assertFails(getDoc(doc(db(ANNE), "orders/cs_1")));
    await assertFails(setDoc(doc(creatorDb(), "orders/cs_2"), { schoolId: THEO }));
    await assertSucceeds(getDoc(doc(creatorDb(), "courses/c1/promoCodes/p1")));
    await assertFails(setDoc(doc(creatorDb(), "courses/c1/promoCodes/p2"), { code: "X" }));
    await assertFails(setDoc(doc(creatorDb(), "courses/c1/private/stripe"), { productId: "x" }));
    await assertSucceeds(
      setDoc(doc(creatorDb(), "courses/c1/private/settings"), { externalCtaUrl: null }),
    );
    await assertSucceeds(getDoc(doc(db(null), "platform/settings")));
    await assertFails(setDoc(doc(creatorDb(), "platform/settings"), { paymentsEnabled: true }));
  });

  it("l'acheteur lit ses commandes (factures) par son email, pas celles des autres", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const admin = ctx.firestore();
      await setDoc(doc(admin, "orders/cs_anne"), {
        schoolId: THEO,
        courseId: "c1",
        email: `${ANNE}@test.fr`,
      });
      await setDoc(doc(admin, "orders/cs_autre"), {
        schoolId: THEO,
        courseId: "c1",
        email: "autre@test.fr",
      });
    });
    await assertSucceeds(getDoc(doc(db(ANNE), "orders/cs_anne")));
    await assertFails(getDoc(doc(db(ANNE), "orders/cs_autre")));
    await assertSucceeds(
      getDocs(query(collection(db(ANNE), "orders"), where("email", "==", `${ANNE}@test.fr`))),
    );
    await assertFails(getDocs(collection(db(ANNE), "orders")));
  });
});

describe("chat école ↔ élève", () => {
  const CONV = "conversations/theo_anne";
  const message = (uid: string, overrides: Record<string, unknown> = {}) => ({
    authorUid: uid,
    authorName: "Anne",
    body: "Bonjour !",
    createdAt: serverTimestamp(),
    ...overrides,
  });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const admin = ctx.firestore();
      await setDoc(doc(admin, CONV), {
        schoolId: THEO,
        schoolName: "Ecole Motion",
        studentUid: ANNE,
        studentName: "Anne",
        unreadForSchool: 2,
        unreadForStudent: 1,
        archived: false,
        blocked: false,
        mutedBy: [],
        lastAt: Timestamp.now(),
      });
      await setDoc(doc(admin, `${CONV}/messages/m1`), {
        ...message(ANNE),
        createdAt: Timestamp.now(),
      });
    });
  });

  it("lisible par l'élève et l'équipe de l'école seulement", async () => {
    await assertSucceeds(getDoc(doc(db(ANNE), CONV)));
    await assertSucceeds(getDoc(doc(coAdminDb(), CONV)));
    await assertSucceeds(getDocs(collection(db(ANNE), `${CONV}/messages`)));
    await assertSucceeds(getDocs(collection(creatorDb(), `${CONV}/messages`)));
    await assertFails(getDoc(doc(db(STRANGER), CONV)));
    await assertFails(getDocs(collection(db(STRANGER), `${CONV}/messages`)));
    await assertFails(getDoc(doc(db(OTHER_CREATOR, { creator: true }), CONV)));
    await assertSucceeds(
      getDocs(query(collection(creatorDb(), "conversations"), where("schoolId", "==", THEO))),
    );
    await assertSucceeds(
      getDocs(query(collection(db(ANNE), "conversations"), where("studentUid", "==", ANNE))),
    );
    await assertFails(getDocs(collection(db(ANNE), "conversations")));
  });

  it("messages : auteur imposé, 1 à 5 000 caractères, date du serveur", async () => {
    const ref = (firestore: Firestore, id: string) => doc(firestore, `${CONV}/messages/${id}`);
    await assertSucceeds(setDoc(ref(db(ANNE), "a"), message(ANNE)));
    await assertSucceeds(setDoc(ref(coAdminDb(), "b"), message(COADMIN, { authorName: "Q" })));
    await assertFails(setDoc(ref(db(ANNE), "c"), message(THEO)));
    await assertFails(setDoc(ref(db(ANNE), "d"), message(ANNE, { body: "" })));
    await assertFails(setDoc(ref(db(ANNE), "e"), message(ANNE, { body: "x".repeat(5001) })));
    await assertFails(setDoc(ref(db(ANNE), "f"), message(ANNE, { createdAt: Timestamp.now() })));
    await assertFails(setDoc(ref(db(ANNE), "g"), { ...message(ANNE), extra: true }));
    await assertFails(setDoc(ref(db(STRANGER), "h"), message(STRANGER)));
    // Ni modification ni suppression.
    await assertFails(updateDoc(ref(db(ANNE), "m1"), { body: "modifié" }));
    await assertFails(deleteDoc(ref(creatorDb(), "m1")));
  });

  it("conversation bloquée : l'élève ne peut plus écrire, l'équipe si", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), CONV), { blocked: true });
    });
    await assertFails(setDoc(doc(db(ANNE), `${CONV}/messages/x`), message(ANNE)));
    await assertSucceeds(setDoc(doc(creatorDb(), `${CONV}/messages/y`), message(THEO)));
  });

  it("chaque côté remet seulement son compteur à zéro ; le reste est au serveur", async () => {
    await assertFails(updateDoc(doc(db(ANNE), CONV), { unreadForSchool: 0 }));
    await assertSucceeds(updateDoc(doc(db(ANNE), CONV), { unreadForStudent: 0 }));
    await assertSucceeds(updateDoc(doc(coAdminDb(), CONV), { unreadForSchool: 0 }));
    await assertFails(updateDoc(doc(db(ANNE), CONV), { blocked: true }));
    await assertFails(updateDoc(doc(creatorDb(), CONV), { unreadForSchool: 3 }));
    await assertFails(updateDoc(doc(creatorDb(), CONV), { archived: true }));
    await assertFails(setDoc(doc(db(ANNE), "conversations/theo_x"), { schoolId: THEO }));
    await assertFails(deleteDoc(doc(creatorDb(), CONV)));
  });
});

describe("leçons", () => {
  it("contenu protégé : inscrit actif ou formateur", async () => {
    await assertSucceeds(getDoc(doc(db(ANNE), "courses/c1/lessons/l2")));
    await assertSucceeds(getDoc(doc(creatorDb(), "courses/c1/lessons/l2")));
    await assertFails(getDoc(doc(db(REVOKED), "courses/c1/lessons/l2")));
    await assertFails(getDoc(doc(db(STRANGER), "courses/c1/lessons/l2")));
    await assertFails(getDoc(doc(db(null), "courses/c1/lessons/l2")));
  });

  it("une leçon en aperçu d'une formation publiée est publique", async () => {
    await assertSucceeds(getDoc(doc(db(null), "courses/c1/lessons/l1")));
  });

  it("seul le formateur écrit les leçons", async () => {
    const data = lessonData({ updatedAt: serverTimestamp() });
    await assertSucceeds(setDoc(doc(creatorDb(), "courses/c1/lessons/l3"), data));
    await assertFails(setDoc(doc(db(ANNE), "courses/c1/lessons/l4"), { ...data, creatorId: ANNE }));
    await assertFails(updateDoc(doc(db(ANNE), "courses/c1/lessons/l2"), { title: "x" }));
  });
});

describe("inscriptions et progression", () => {
  it("personne ne crée d'inscription côté client", async () => {
    await assertFails(
      setDoc(doc(db(STRANGER), "enrollments/c1_inconnu"), enrollmentData(STRANGER)),
    );
    await assertFails(setDoc(doc(creatorDb(), "enrollments/c1_inconnu"), enrollmentData(STRANGER)));
  });

  it("l'élève ne modifie que sa progression", async () => {
    const ref = doc(db(ANNE), "enrollments/c1_anne");
    await assertSucceeds(
      updateDoc(ref, {
        "progress.completedLessonIds": arrayUnion("l2"),
        "progress.lastLessonId": "l2",
        "progress.lastActivityAt": serverTimestamp(),
      }),
    );
    await assertFails(updateDoc(ref, { status: "active", courseId: "autre" }));
    await assertFails(updateDoc(ref, { "progress.lastActivityAt": Timestamp.fromMillis(0) }));
    await assertFails(
      updateDoc(doc(db(REVOKED), "enrollments/c1_revoque"), {
        "progress.lastActivityAt": serverTimestamp(),
      }),
    );
  });

  it("lecture : l'élève ses inscriptions, le formateur celles de ses formations", async () => {
    await assertSucceeds(
      getDocs(query(collection(db(ANNE), "enrollments"), where("uid", "==", ANNE))),
    );
    await assertSucceeds(
      getDocs(query(collection(creatorDb(), "enrollments"), where("creatorId", "==", THEO))),
    );
    await assertFails(getDocs(collection(db(ANNE), "enrollments")));
    await assertFails(getDoc(doc(db(STRANGER), "enrollments/c1_anne")));
  });
});

describe("commentaires", () => {
  it("un inscrit commente, un inconnu ou un révoqué non", async () => {
    await assertSucceeds(setDoc(doc(db(ANNE), "courses/c1/comments/new"), commentData(ANNE)));
    await assertFails(setDoc(doc(db(STRANGER), "courses/c1/comments/x"), commentData(STRANGER)));
    await assertFails(setDoc(doc(db(REVOKED), "courses/c1/comments/y"), commentData(REVOKED)));
  });

  it("impossible d'usurper l'auteur", async () => {
    await assertFails(setDoc(doc(db(ANNE), "courses/c1/comments/z"), commentData(THEO)));
  });

  it("réponses limitées à un niveau, sur la même leçon", async () => {
    const anne = db(ANNE);
    await assertSucceeds(
      setDoc(doc(anne, "courses/c1/comments/r1"), commentData(ANNE, { parentId: "root" })),
    );
    await assertFails(
      setDoc(doc(anne, "courses/c1/comments/r2"), commentData(ANNE, { parentId: "reply" })),
    );
    await assertFails(
      setDoc(
        doc(anne, "courses/c1/comments/r3"),
        commentData(ANNE, { parentId: "root", lessonId: "l1" }),
      ),
    );
  });

  it("mode restreint : les élèves lisent sans écrire, le formateur écrit", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), "courses/c1"), { commentsMode: "restricted" }),
    );
    await assertSucceeds(getDoc(doc(db(ANNE), "courses/c1/comments/root")));
    await assertFails(setDoc(doc(db(ANNE), "courses/c1/comments/n"), commentData(ANNE)));
    await assertSucceeds(
      setDoc(doc(creatorDb(), "courses/c1/comments/n2"), commentData(THEO, { authorName: "Théo" })),
    );
  });

  it("mode masqué : les élèves ne lisent plus", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), "courses/c1"), { commentsMode: "hidden" }),
    );
    await assertFails(getDoc(doc(db(ANNE), "courses/c1/comments/root")));
    await assertSucceeds(getDoc(doc(creatorDb(), "courses/c1/comments/root")));
  });

  it("suppression par l'auteur ou le formateur", async () => {
    await assertFails(deleteDoc(doc(db(STRANGER), "courses/c1/comments/root")));
    await assertSucceeds(deleteDoc(doc(creatorDb(), "courses/c1/comments/root")));
  });

  it("le formateur lit tous ses commentaires (collection group)", async () => {
    await assertSucceeds(
      getDocs(query(collectionGroup(creatorDb(), "comments"), where("creatorId", "==", THEO))),
    );
    await assertFails(
      getDocs(query(collectionGroup(db(ANNE), "comments"), where("creatorId", "==", THEO))),
    );
  });
});

describe("utilisateurs et zones serveur", () => {
  it("profil public lisible par les connectés, modifiable par soi", async () => {
    const data = { displayName: "Anne", avatarUrl: null, createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db(ANNE), "profiles/anne"), data));
    await assertSucceeds(getDoc(doc(db(STRANGER), "profiles/anne")));
    await assertFails(getDoc(doc(db(null), "profiles/anne")));
    await assertFails(setDoc(doc(db(STRANGER), "profiles/anne"), data));
  });

  it("données privées : email imposé par le token", async () => {
    await assertSucceeds(
      setDoc(doc(db(ANNE), "users/anne"), {
        email: "anne@test.fr",
        notifyOnComment: true,
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db(STRANGER), "users/inconnu"), {
        email: "autre@test.fr",
        notifyOnComment: true,
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(getDoc(doc(db(STRANGER), "users/anne")));
  });

  it("appareils push : gérés par leur propriétaire seul", async () => {
    const token = {
      token: "fcm-token-de-test-123456",
      userAgent: "Chrome sur Mac",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const ref = (firestore: Firestore) => doc(firestore, "users/anne/pushTokens/abc");
    await assertSucceeds(setDoc(ref(db(ANNE)), token));
    await assertSucceeds(
      updateDoc(ref(db(ANNE)), { token: "fcm-token-renouvele-7890", updatedAt: serverTimestamp() }),
    );
    // createdAt figé, champs imposés, token non vide.
    await assertFails(updateDoc(ref(db(ANNE)), { createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db(ANNE), "users/anne/pushTokens/x"), { ...token, extra: 1 }));
    await assertFails(setDoc(doc(db(ANNE), "users/anne/pushTokens/y"), { ...token, token: "" }));
    // Personne d'autre ne lit, n'ajoute ni ne supprime.
    await assertFails(getDoc(ref(db(STRANGER))));
    await assertFails(setDoc(doc(db(STRANGER), "users/anne/pushTokens/z"), token));
    await assertFails(deleteDoc(ref(creatorDb())));
    await assertSucceeds(getDocs(collection(db(ANNE), "users/anne/pushTokens")));
    await assertSucceeds(deleteDoc(ref(db(ANNE))));
  });

  it("invitations et emails inaccessibles au client", async () => {
    await assertFails(getDoc(doc(creatorDb(), "invites/abc")));
    await assertFails(setDoc(doc(creatorDb(), "mail/x"), { to: "a@b.c", creatorId: THEO }));
    await assertFails(getDoc(doc(creatorDb(), "mail/x")));
  });

  it("fiche école : publique, modifiable uniquement par le serveur", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "creators/theo"), {
        name: "Ecole Motion",
        slug: "ecole-motion",
      });
    });
    await assertSucceeds(getDoc(doc(db(null), "creators/theo")));
    await assertFails(updateDoc(doc(creatorDb(), "creators/theo"), { slug: "autre" }));
    await assertFails(
      setDoc(doc(db(OTHER_CREATOR, { creator: true }), "creators/autre"), {
        name: "Autre",
        slug: "ecole-motion",
      }),
    );
  });

  it("réglages d'envoi : lus par le formateur seul, écrits par le serveur ; secret inaccessible", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const admin = ctx.firestore();
      await setDoc(doc(admin, "creators/theo/private/mail"), { host: "smtp-relay.brevo.com" });
      await setDoc(doc(admin, "creators/theo/secrets/mail"), { password: "v1:chiffré" });
    });
    await assertSucceeds(getDoc(doc(creatorDb(), "creators/theo/private/mail")));
    await assertFails(
      getDoc(doc(db(OTHER_CREATOR, { creator: true }), "creators/theo/private/mail")),
    );
    await assertFails(getDoc(doc(db(null), "creators/theo/private/mail")));
    await assertFails(
      setDoc(doc(creatorDb(), "creators/theo/private/mail"), { host: "smtp.evil.com" }),
    );
    await assertFails(getDoc(doc(creatorDb(), "creators/theo/secrets/mail")));
    await assertFails(setDoc(doc(creatorDb(), "creators/theo/secrets/mail"), { password: "x" }));
  });

  it("informations légales : publiques, écrites par le serveur", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "creators/theo/legal/info"), { companyName: "Ecole" });
    });
    await assertSucceeds(getDoc(doc(db(null), "creators/theo/legal/info")));
    await assertFails(
      setDoc(doc(creatorDb(), "creators/theo/legal/info"), { companyName: "Autre" }),
    );
  });
});

describe("certificats", () => {
  it("vérifiables par tous, délivrés par le serveur", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "certificates/abc123def456"), { studentName: "Anne" });
    });
    await assertSucceeds(getDoc(doc(db(null), "certificates/abc123def456")));
    await assertFails(setDoc(doc(db(ANNE), "certificates/faux"), { studentName: "Anne" }));
  });

  it("ouverture progressive : dans l'ordre ou un chapitre tous les 1 à 90 jours", async () => {
    const ref = doc(creatorDb(), "courses/c1");
    const drip = (value: unknown) => updateDoc(ref, { drip: value, updatedAt: serverTimestamp() });
    await assertSucceeds(drip({ mode: "sequential" }));
    await assertSucceeds(drip({ mode: "schedule", intervalDays: 7 }));
    await assertSucceeds(drip(null));
    await assertFails(drip({ mode: "schedule", intervalDays: 0 }));
    await assertFails(drip({ mode: "hasard" }));
  });

  it("le formateur active ou désactive le certificat d'une formation (booléen)", async () => {
    const ref = doc(creatorDb(), "courses/c1");
    await assertSucceeds(updateDoc(ref, { certificate: false, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { certificate: "non", updatedAt: serverTimestamp() }));
  });

  it("l'élève ne se délivre pas de certificat via son inscription", async () => {
    const ref = doc(db(ANNE), `enrollments/c1_${ANNE}`);
    await assertFails(updateDoc(ref, { certificateId: "faux" }));
  });
});

describe("annonces", () => {
  it("lues par les inscrits et l'équipe, publiées par le serveur", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "courses/c1/announcements/a1"), { title: "Nouveau" });
    });
    await assertSucceeds(getDoc(doc(db(ANNE), "courses/c1/announcements/a1")));
    await assertSucceeds(getDoc(doc(creatorDb(), "courses/c1/announcements/a1")));
    await assertFails(getDoc(doc(db(STRANGER), "courses/c1/announcements/a1")));
    await assertFails(getDoc(doc(db(REVOKED), "courses/c1/announcements/a1")));
    await assertFails(setDoc(doc(creatorDb(), "courses/c1/announcements/a2"), { title: "x" }));
  });
});

describe("quiz", () => {
  const quiz = {
    passPercent: 70,
    required: false,
    questions: [{ id: "q1", text: "Question ?", multiple: false, choices: [] }],
  };
  const key = (overrides: Record<string, unknown> = {}) => ({
    creatorId: THEO,
    courseId: "c1",
    answers: { q1: ["a"] },
    explanations: {},
    updatedAt: serverTimestamp(),
    ...overrides,
  });

  it("le formateur ajoute un quiz valide à une leçon", async () => {
    const ref = doc(creatorDb(), "courses/c1/lessons/l2");
    const save = (value: unknown) => updateDoc(ref, { quiz: value, updatedAt: serverTimestamp() });
    await assertSucceeds(save(quiz));
    await assertSucceeds(save(null));
    await assertFails(save({ ...quiz, questions: [] }));
    await assertFails(save({ ...quiz, passPercent: 150 }));
    await assertFails(save({ ...quiz, answers: { q1: ["a"] } }));
  });

  it("les bonnes réponses : formateurs seulement", async () => {
    await assertSucceeds(setDoc(doc(creatorDb(), "courses/c1/quizKeys/l2"), key()));
    await assertSucceeds(getDoc(doc(coAdminDb(), "courses/c1/quizKeys/l2")));
    await assertFails(getDoc(doc(db(ANNE), "courses/c1/quizKeys/l2")));
    await assertFails(setDoc(doc(db(ANNE), "courses/c1/quizKeys/l1"), key()));
    await assertFails(
      setDoc(doc(creatorDb(), "courses/c1/quizKeys/l1"), key({ creatorId: OTHER_CREATOR })),
    );
    await assertFails(setDoc(doc(creatorDb(), "courses/c1/quizKeys/l1"), key({ extra: true })));
    await assertSucceeds(deleteDoc(doc(creatorDb(), "courses/c1/quizKeys/l2")));
  });

  it("l'élève ne s'attribue pas de résultat de quiz", async () => {
    const ref = doc(db(ANNE), "enrollments/c1_anne");
    await assertFails(updateDoc(ref, { "quizResults.l2": { passed: true } }));
  });
});

describe("exercices rendus", () => {
  const submission = (uid: string, overrides: Record<string, unknown> = {}) => ({
    courseId: "c1",
    creatorId: THEO,
    lessonId: "l2",
    lessonTitle: "Interface",
    uid,
    studentName: "Anne",
    file: {
      path: `submissions/c1/${uid}/1-exo.mp4`,
      name: "exo.mp4",
      size: 1000,
      contentType: "video/mp4",
    },
    link: null,
    note: "",
    status: "submitted",
    createdAt: serverTimestamp(),
    reviewedAt: null,
    lastFeedbackAt: null,
    ...overrides,
  });
  const feedback = (uid: string, overrides: Record<string, unknown> = {}) => ({
    authorUid: uid,
    authorName: "Théo",
    atSec: 12.5,
    body: "Super !",
    createdAt: serverTimestamp(),
    ...overrides,
  });
  const seed = () =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "submissions/s1"), {
        ...submission(ANNE),
        createdAt: Timestamp.now(),
      });
    });

  it("l'élève inscrit rend un exercice pour lui-même (fichier à son nom ou lien)", async () => {
    await assertSucceeds(setDoc(doc(db(ANNE), "submissions/a"), submission(ANNE)));
    await assertSucceeds(
      setDoc(
        doc(db(ANNE), "submissions/b"),
        submission(ANNE, { file: null, link: "https://x.fr" }),
      ),
    );
    await assertFails(setDoc(doc(db(ANNE), "submissions/c"), submission(ANNE, { file: null })));
    await assertFails(
      setDoc(doc(db(ANNE), "submissions/d"), submission(ANNE, { status: "reviewed" })),
    );
    await assertFails(
      setDoc(
        doc(db(ANNE), "submissions/e"),
        submission(ANNE, {
          file: { ...submission(ANNE).file, path: "submissions/c1/autre/x.mp4" },
        }),
      ),
    );
    await assertFails(setDoc(doc(db(REVOKED), "submissions/f"), submission(REVOKED)));
    await assertFails(setDoc(doc(db(STRANGER), "submissions/g"), submission(STRANGER)));
    await assertFails(setDoc(doc(db(ANNE), "submissions/h"), submission(STRANGER)));
    await assertFails(
      setDoc(doc(db(ANNE), "submissions/i"), submission(ANNE, { creatorId: OTHER_CREATOR })),
    );
  });

  it("lecture : l'élève et l'équipe de l'école ; correction par l'équipe seulement", async () => {
    await seed();
    await assertSucceeds(getDoc(doc(db(ANNE), "submissions/s1")));
    await assertSucceeds(getDoc(doc(coAdminDb(), "submissions/s1")));
    await assertFails(getDoc(doc(db(STRANGER), "submissions/s1")));
    await assertSucceeds(
      getDocs(query(collection(creatorDb(), "submissions"), where("creatorId", "==", THEO))),
    );
    await assertFails(
      updateDoc(doc(db(ANNE), "submissions/s1"), {
        status: "reviewed",
        reviewedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(creatorDb(), "submissions/s1"), { status: "reviewed", reviewedAt: null }),
    );
    await assertSucceeds(
      updateDoc(doc(creatorDb(), "submissions/s1"), {
        status: "reviewed",
        reviewedAt: serverTimestamp(),
      }),
    );
    // Corrigé : l'élève ne peut plus le retirer.
    await assertFails(deleteDoc(doc(db(ANNE), "submissions/s1")));
  });

  it("retours : l'équipe et l'élève concerné, horodatage valide", async () => {
    await seed();
    await assertSucceeds(setDoc(doc(creatorDb(), "submissions/s1/feedback/f1"), feedback(THEO)));
    await assertSucceeds(
      setDoc(doc(db(ANNE), "submissions/s1/feedback/f2"), feedback(ANNE, { atSec: null })),
    );
    await assertFails(setDoc(doc(db(STRANGER), "submissions/s1/feedback/f3"), feedback(STRANGER)));
    await assertFails(setDoc(doc(db(ANNE), "submissions/s1/feedback/f4"), feedback(THEO)));
    await assertFails(
      setDoc(doc(creatorDb(), "submissions/s1/feedback/f5"), feedback(THEO, { atSec: -1 })),
    );
    await assertSucceeds(getDoc(doc(db(ANNE), "submissions/s1/feedback/f1")));
    await assertFails(getDoc(doc(db(STRANGER), "submissions/s1/feedback/f1")));
    await assertFails(deleteDoc(doc(db(ANNE), "submissions/s1/feedback/f1")));
    await assertSucceeds(deleteDoc(doc(db(ANNE), "submissions/s1/feedback/f2")));
  });

  it("consignes d'exercice sur une leçon", async () => {
    const ref = doc(creatorDb(), "courses/c1/lessons/l2");
    const save = (value: unknown) =>
      updateDoc(ref, { exercise: value, updatedAt: serverTimestamp() });
    await assertSucceeds(save({ instructions: "Anime ton logo en 5 secondes." }));
    await assertSucceeds(save(null));
    await assertFails(save({ instructions: "x".repeat(3001) }));
    await assertFails(save({ instructions: "ok", deadline: 3 }));
  });
});

describe("assiduité et avis", () => {
  const activity = (overrides: Record<string, unknown> = {}) => ({
    day: "2026-09-27",
    seconds: 60,
    lessonIds: ["l1"],
    updatedAt: serverTimestamp(),
    ...overrides,
  });

  it("l'élève compte son temps : une minute au plus, pas plus d'une fois par minute", async () => {
    const ref = doc(db(ANNE), "enrollments/c1_anne/activity/2026-09-27");
    await assertFails(setDoc(ref, activity({ seconds: 3600 })));
    await assertFails(setDoc(ref, activity({ day: "2026-09-28" })));
    await assertSucceeds(setDoc(ref, activity()));
    // Trop tôt après la précédente écriture.
    await assertFails(setDoc(ref, activity({ seconds: 120 })));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "enrollments/c1_anne/activity/2026-09-27"), {
        ...activity(),
        updatedAt: Timestamp.fromMillis(Date.now() - 120_000),
      });
    });
    await assertFails(setDoc(ref, activity({ seconds: 600 })));
    await assertSucceeds(setDoc(ref, activity({ seconds: 120 })));
    await assertFails(
      setDoc(doc(db(REVOKED), "enrollments/c1_revoque/activity/2026-09-27"), activity()),
    );
    await assertFails(
      setDoc(doc(db(STRANGER), "enrollments/c1_anne/activity/2026-09-26"), activity()),
    );
  });

  it("relevé lisible par l'élève et l'équipe de l'école", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "enrollments/c1_anne/activity/2026-09-27"), {
        ...activity(),
        updatedAt: Timestamp.now(),
      });
    });
    await assertSucceeds(getDocs(collection(db(ANNE), "enrollments/c1_anne/activity")));
    await assertSucceeds(getDocs(collection(coAdminDb(), "enrollments/c1_anne/activity")));
    await assertFails(getDocs(collection(db(STRANGER), "enrollments/c1_anne/activity")));
  });

  const review = (uid: string, overrides: Record<string, unknown> = {}) => ({
    courseId: "c1",
    uid,
    creatorId: THEO,
    studentName: "Anne",
    rating: 5,
    recommend: true,
    comment: "Top",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  });

  it("avis : l'élève inscrit écrit le sien, l'équipe les lit", async () => {
    await assertSucceeds(getDoc(doc(db(ANNE), "reviews/c1_anne")));
    await assertSucceeds(setDoc(doc(db(ANNE), "reviews/c1_anne"), review(ANNE)));
    await assertFails(setDoc(doc(db(ANNE), "reviews/c1_autre"), review(ANNE)));
    await assertFails(setDoc(doc(db(REVOKED), "reviews/c1_revoque"), review(REVOKED)));
    await assertFails(setDoc(doc(db(ANNE), "reviews/c1_anne"), review(ANNE, { rating: 6 })));
    await assertFails(
      setDoc(doc(db(ANNE), "reviews/c1_anne"), review(ANNE, { creatorId: OTHER_CREATOR })),
    );
    await assertSucceeds(
      getDocs(query(collection(creatorDb(), "reviews"), where("creatorId", "==", THEO))),
    );
    await assertFails(getDoc(doc(db(STRANGER), "reviews/c1_anne")));
    await assertFails(
      getDocs(query(collection(db(ANNE), "reviews"), where("creatorId", "==", THEO))),
    );
  });
});

describe("assistant IA", () => {
  it("le formateur l'active sur sa formation (booléen), les secrets restent au serveur", async () => {
    const ref = doc(creatorDb(), "courses/c1");
    await assertSucceeds(updateDoc(ref, { assistant: true, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { assistant: "oui", updatedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(db(null), "platform/assistant")));
    await assertFails(getDoc(doc(creatorDb(), "platformSecrets/assistant")));
    await assertFails(getDoc(doc(db(ANNE), "assistantUsage/anne_2026-09-27")));
  });
});

describe("communauté d'école", () => {
  const post = (uid: string, overrides: Record<string, unknown> = {}) => ({
    authorUid: uid,
    authorName: "Anne",
    authorAvatarUrl: null,
    body: "Bonjour à tous !",
    pinned: false,
    replyCount: 0,
    lastReplyAt: null,
    createdAt: serverTimestamp(),
    ...overrides,
  });
  const open = (enabled = true) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "communities/theo"), { enabled });
      await setDoc(doc(ctx.firestore(), "communities/theo/people/anne"), { uid: ANNE });
      await setDoc(doc(ctx.firestore(), "communities/theo/posts/p1"), {
        ...post(ANNE),
        createdAt: Timestamp.now(),
      });
    });

  it("membres et équipe publient ; les autres ne voient rien", async () => {
    await open();
    await assertSucceeds(setDoc(doc(db(ANNE), "communities/theo/posts/a"), post(ANNE)));
    await assertSucceeds(setDoc(doc(coAdminDb(), "communities/theo/posts/b"), post(COADMIN)));
    await assertFails(setDoc(doc(db(STRANGER), "communities/theo/posts/c"), post(STRANGER)));
    await assertFails(
      setDoc(doc(db(ANNE), "communities/theo/posts/d"), post(ANNE, { pinned: true })),
    );
    await assertFails(setDoc(doc(db(ANNE), "communities/theo/posts/e"), post(THEO)));
    await assertSucceeds(getDocs(collection(db(ANNE), "communities/theo/posts")));
    await assertFails(getDocs(collection(db(STRANGER), "communities/theo/posts")));
    await assertFails(setDoc(doc(db(ANNE), "communities/theo"), { enabled: true }));
    await assertFails(setDoc(doc(db(ANNE), "communities/theo/people/inconnu"), { uid: STRANGER }));
  });

  it("communauté fermée : plus de lecture ni de publication pour les élèves", async () => {
    await open(false);
    await assertFails(getDocs(collection(db(ANNE), "communities/theo/posts")));
    await assertFails(setDoc(doc(db(ANNE), "communities/theo/posts/a"), post(ANNE)));
  });

  it("épingler : l'équipe ; modifier : l'auteur ; supprimer : l'auteur ou l'équipe", async () => {
    await open();
    await assertFails(updateDoc(doc(db(ANNE), "communities/theo/posts/p1"), { pinned: true }));
    await assertSucceeds(
      updateDoc(doc(creatorDb(), "communities/theo/posts/p1"), { pinned: true }),
    );
    await assertSucceeds(
      updateDoc(doc(db(ANNE), "communities/theo/posts/p1"), {
        body: "Modifié",
        editedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(creatorDb(), "communities/theo/posts/p1"), { body: "Censuré" }),
    );
    await assertSucceeds(
      setDoc(doc(db(ANNE), "communities/theo/posts/p1/replies/r1"), {
        authorUid: ANNE,
        authorName: "Anne",
        authorAvatarUrl: null,
        body: "Merci",
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(db(STRANGER), "communities/theo/posts/p1")));
    await assertSucceeds(deleteDoc(doc(creatorDb(), "communities/theo/posts/p1/replies/r1")));
    await assertSucceeds(deleteDoc(doc(creatorDb(), "communities/theo/posts/p1")));
  });
});

describe("directs", () => {
  const live = (overrides: Record<string, unknown> = {}) => ({
    creatorId: THEO,
    courseId: "c1",
    title: "Questions-réponses",
    description: "",
    startsAt: Timestamp.fromDate(new Date("2026-10-01T17:00:00Z")),
    durationMin: 60,
    joinUrl: "https://meet.google.com/abc",
    replayUrl: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  });

  it("programmés par l'équipe, vus par les inscrits", async () => {
    await assertSucceeds(setDoc(doc(creatorDb(), "courses/c1/lives/d1"), live()));
    await assertSucceeds(setDoc(doc(coAdminDb(), "courses/c1/lives/d2"), live()));
    await assertFails(setDoc(doc(db(ANNE), "courses/c1/lives/d3"), live()));
    await assertFails(
      setDoc(doc(creatorDb(), "courses/c1/lives/d4"), live({ joinUrl: "javascript:alert(1)" })),
    );
    await assertFails(setDoc(doc(creatorDb(), "courses/c1/lives/d5"), live({ durationMin: 5 })));
    await assertSucceeds(getDoc(doc(db(ANNE), "courses/c1/lives/d1")));
    await assertFails(getDoc(doc(db(STRANGER), "courses/c1/lives/d1")));
    await assertFails(getDoc(doc(db(REVOKED), "courses/c1/lives/d1")));
    await assertSucceeds(
      updateDoc(doc(creatorDb(), "courses/c1/lives/d1"), {
        replayUrl: "https://vimeo.com/123",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db(ANNE), "courses/c1/lives/d1"), { title: "x", updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(deleteDoc(doc(creatorDb(), "courses/c1/lives/d1")));
  });
});

describe("webhooks", () => {
  it("lus par l'équipe de l'école, écrits par le serveur", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "creators/theo/webhooks/w1"), { url: "https://x.fr" });
    });
    await assertSucceeds(getDoc(doc(coAdminDb(), "creators/theo/webhooks/w1")));
    await assertFails(getDoc(doc(db(ANNE), "creators/theo/webhooks/w1")));
    await assertFails(
      setDoc(doc(creatorDb(), "creators/theo/webhooks/w2"), { url: "https://y.fr" }),
    );
  });
});
