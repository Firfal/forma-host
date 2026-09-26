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
});
