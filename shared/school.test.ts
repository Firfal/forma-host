import { describe, expect, it } from "vitest";
import { nextPreviousSlugs, schoolAdminSet, schoolProfileInput, schoolsFromClaims } from "./school";

const base = {
  name: "Ecole Motion",
  slug: "ecole-motion",
  logoUrl: null,
  brandColor: "#9d72f9",
  supportEmail: "Theo@Clastra.io",
};

describe("schoolProfileInput", () => {
  it("valide et normalise le profil", () => {
    const parsed = schoolProfileInput.parse({ ...base, slug: " Ecole-Motion " });
    expect(parsed.slug).toBe("ecole-motion");
    expect(parsed.supportEmail).toBe("theo@clastra.io");
  });

  it("refuse les adresses invalides ou réservées", () => {
    for (const slug of ["école motion", "admin", "formations", "-motion", ""]) {
      expect(schoolProfileInput.safeParse({ ...base, slug }).success, slug).toBe(false);
    }
  });

  it("refuse une couleur ou un logo invalides", () => {
    expect(schoolProfileInput.safeParse({ ...base, brandColor: "violet" }).success).toBe(false);
    expect(schoolProfileInput.safeParse({ ...base, logoUrl: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(
      schoolProfileInput.safeParse({ ...base, logoUrl: "https://firebasestorage.googleapis.com/x" })
        .success,
    ).toBe(true);
  });
});

describe("nextPreviousSlugs", () => {
  it("garde l'ancienne adresse pour la redirection", () => {
    expect(nextPreviousSlugs({ slug: "ecole-motion" }, "motion")).toEqual(["ecole-motion"]);
    expect(
      nextPreviousSlugs({ slug: "motion", previousSlugs: ["ecole-motion"] }, "ecole-motion"),
    ).toEqual(["motion"]);
    expect(nextPreviousSlugs({ slug: "motion", previousSlugs: ["a"] }, "motion")).toEqual(["a"]);
  });
});

describe("écoles gérées", () => {
  it("lit les écoles dans les claims", () => {
    expect(schoolsFromClaims("anne", { creator: true, schools: ["theo", "anne"] })).toEqual([
      "theo",
      "anne",
    ]);
    // Ancien jeton de propriétaire, sans claim « schools ».
    expect(schoolsFromClaims("theo", { creator: true })).toEqual(["theo"]);
    expect(schoolsFromClaims("eleve", {})).toEqual([]);
  });

  it("liste les administrateurs d'une école", () => {
    expect([...schoolAdminSet("theo", { adminUids: ["theo", "quentin"] })]).toEqual([
      "theo",
      "quentin",
    ]);
    expect([...schoolAdminSet("theo", null)]).toEqual(["theo"]);
  });
});
