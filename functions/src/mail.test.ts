import { describe, expect, it } from "vitest";
import { buildWelcomeEmail, firstName } from "./mail";

const brand = { name: "Ecole Motion", color: "#5a0eb5", supportEmail: "theo@ecolemotion.com" };

describe("buildWelcomeEmail", () => {
  it("utilise le modèle par défaut et le lien d'activation", () => {
    const mail = buildWelcomeEmail({
      to: "anne@test.fr",
      studentName: "Anne Martin",
      courseTitle: "After Effects de A à Z",
      settings: undefined,
      brand,
      ctaUrl: "https://app.test/bienvenue/tok",
      activation: true,
    });
    expect(mail.to).toBe("anne@test.fr");
    expect(mail.replyTo).toBe("theo@ecolemotion.com");
    expect(mail.message.subject).toBe("Bienvenue dans After Effects de A à Z !");
    expect(mail.message.html).toContain("Bonjour Anne,");
    expect(mail.message.html).toContain("Activer mon compte");
    expect(mail.message.html).toContain("https://app.test/bienvenue/tok");
    expect(mail.message.text).toContain("https://app.test/bienvenue/tok");
  });

  it("applique le modèle personnalisé en échappant les valeurs", () => {
    const mail = buildWelcomeEmail({
      to: "x@test.fr",
      studentName: "<b>Hack</b>",
      courseTitle: "Cours",
      settings: { welcomeEmail: { subject: "Salut {{prenom}}", body: "Lien : {{lien}}" } },
      brand,
      ctaUrl: "https://app.test/formations/c1",
      activation: false,
    });
    expect(mail.message.subject).toBe("Salut <b>Hack</b>");
    expect(mail.message.html).not.toContain("<b>Hack</b>");
    expect(mail.message.html).toContain("Accéder à la formation");
  });

  it("extrait le prénom", () => {
    expect(firstName("  Anne  Martin ")).toBe("Anne");
    expect(firstName(null)).toBe("");
  });
});
