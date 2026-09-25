import { describe, expect, it } from "vitest";
import { grantAccessInput, lessonLinkSchema } from "./schemas";

describe("schemas", () => {
  it("normalise les emails et valide l'import", () => {
    const parsed = grantAccessInput.parse({
      courseId: "c1",
      source: "import",
      sendEmail: false,
      students: [{ email: "  Anne@Example.COM ", joinedAt: "2024-02-19T10:00:00Z" }],
    });
    expect(parsed.students[0].email).toBe("anne@example.com");
  });

  it("refuse un email invalide", () => {
    const result = grantAccessInput.safeParse({
      courseId: "c1",
      source: "invite",
      sendEmail: true,
      students: [{ email: "pas-un-email" }],
    });
    expect(result.success).toBe(false);
  });

  it("n'accepte que les liens http(s)", () => {
    expect(
      lessonLinkSchema.safeParse({ label: "Discord", url: "https://discord.gg/x" }).success,
    ).toBe(true);
    expect(lessonLinkSchema.safeParse({ label: "XSS", url: "javascript:alert(1)" }).success).toBe(
      false,
    );
  });
});
