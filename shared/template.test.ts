import { describe, expect, it } from "vitest";
import { emailLayout, fillTemplate, textToHtml } from "./template";

describe("template", () => {
  it("remplace les variables connues et garde les autres", () => {
    expect(fillTemplate("Bonjour {{prenom}} {{ inconnu }}", { prenom: "Anne" })).toBe(
      "Bonjour Anne {{ inconnu }}",
    );
  });

  it("échappe le texte et les variables", () => {
    const html = textToHtml("Salut {{prenom}} <b>\n\nFin", { prenom: "<script>" });
    expect(html).toContain("Salut &lt;script&gt; &lt;b&gt;");
    expect(html).not.toContain("<script>");
    expect(html.match(/<p /g)).toHaveLength(2);
  });

  it("échappe l'URL du bouton et ignore une couleur invalide", () => {
    const html = emailLayout({
      bodyHtml: "<p>x</p>",
      ctaLabel: "Go",
      ctaUrl: 'https://a.b/?x="y"',
      brandName: "Ecole Motion",
      brandColor: "red;background:url(x)",
    });
    expect(html).toContain("https://a.b/?x=&quot;y&quot;");
    expect(html).toContain("background:#06040e");
  });
});
