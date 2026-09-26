import { describe, expect, it } from "vitest";
import { pushData, pushTokenId, safeLink } from "./push";

describe("pushData", () => {
  it("raccourcit le titre et le texte, et garde l'identifiant comme tag", () => {
    const data = pushData({
      id: "comment_1",
      title: "Léa a commenté « Intro »",
      body: `${"très long ".repeat(40)}\n fin`,
      link: "/admin/commentaires",
    });
    expect(data.title).toBe("Léa a commenté « Intro »");
    expect(data.body.length).toBe(240);
    expect(data.body.endsWith("…")).toBe(true);
    expect(data.body).not.toContain("\n");
    expect(data).toMatchObject({ link: "/admin/commentaires", tag: "comment_1" });
  });
});

describe("safeLink", () => {
  it("garde les chemins internes", () => {
    expect(safeLink("/formations/abc?lecon=1")).toBe("/formations/abc?lecon=1");
  });

  it("remplace les adresses externes ou absentes par l'accueil", () => {
    expect(safeLink("https://exemple.com")).toBe("/");
    expect(safeLink("//exemple.com/x")).toBe("/");
    expect(safeLink("/\\exemple.com")).toBe("/");
    expect(safeLink("javascript:alert(1)")).toBe("/");
    expect(safeLink("")).toBe("/");
    expect(safeLink(undefined)).toBe("/");
  });
});

describe("pushTokenId", () => {
  it("donne un SHA-256 hexadécimal stable", async () => {
    const id = await pushTokenId("token:abc");
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(await pushTokenId("token:abc")).toBe(id);
    expect(await pushTokenId("token:abd")).not.toBe(id);
  });
});
