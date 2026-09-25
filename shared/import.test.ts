import { describe, expect, it } from "vitest";
import { parseInviteText, parseLooseDate, parseStudentRows } from "./import";

describe("parseInviteText", () => {
  it("accepte plusieurs formats et dédoublonne", () => {
    const result = parseInviteText(
      [
        "anne@exemple.fr",
        "Laure Petit <Laure@Exemple.fr>",
        "marc@exemple.fr, Marc Dupont",
        "a@b.fr; c@d.fr",
        "anne@exemple.fr",
        "pas un email",
        "",
      ].join("\n"),
    );
    expect(result.students).toEqual([
      { email: "anne@exemple.fr" },
      { email: "laure@exemple.fr", name: "Laure Petit" },
      { email: "marc@exemple.fr", name: "Marc Dupont" },
      { email: "a@b.fr" },
      { email: "c@d.fr" },
    ]);
    expect(result.invalid).toEqual(["pas un email"]);
  });

  it("signale les emails mal formés", () => {
    expect(parseInviteText("x@y").invalid).toEqual(["x@y"]);
  });
});

describe("parseStudentRows", () => {
  it("lit un export type Podia (en-têtes anglais)", () => {
    const result = parseStudentRows([
      ["Name", "Email", "Signed up", "Progress"],
      ["Pierre Levallois", "Pierre@Exemple.fr", "Feb 19, 2024", "11 / 15"],
      ["", "isabelle@exemple.fr", "", "0 / 15"],
      ["Bad", "not-an-email", "", ""],
    ]);
    expect(result.emailColumnFound).toBe(true);
    expect(result.students[0]).toMatchObject({
      email: "pierre@exemple.fr",
      name: "Pierre Levallois",
    });
    expect(result.students[0].joinedAt?.startsWith("2024-02-19")).toBe(true);
    expect(result.students[1]).toEqual({ email: "isabelle@exemple.fr" });
    expect(result.invalid).toEqual(["not-an-email"]);
  });

  it("combine prénom et nom, dates françaises", () => {
    const result = parseStudentRows([
      ["Prénom", "Nom de famille", "Adresse email", "Date d'inscription"],
      ["Anne", "Martin", "anne@exemple.fr", "06/02/2025"],
    ]);
    expect(result.students).toEqual([
      { email: "anne@exemple.fr", name: "Anne Martin", joinedAt: "2025-02-06T12:00:00.000Z" },
    ]);
  });

  it("trouve les emails sans en-tête reconnu", () => {
    const result = parseStudentRows([["anne@exemple.fr"], ["marc@exemple.fr"]]);
    expect(result.students.map((s) => s.email)).toEqual(["anne@exemple.fr", "marc@exemple.fr"]);
  });

  it("échoue proprement sans colonne email", () => {
    expect(parseStudentRows([["Nom"], ["Anne"]]).emailColumnFound).toBe(false);
  });

  it("ignore les dates invalides ou futures", () => {
    expect(parseLooseDate("n'importe quoi")).toBeUndefined();
    expect(parseLooseDate("2999-01-01")).toBeUndefined();
    expect(parseLooseDate("")).toBeUndefined();
  });
});
