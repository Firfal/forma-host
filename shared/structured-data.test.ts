import { describe, expect, it } from "vitest";
import { courseJsonLd, jsonLdScript, schoolJsonLd } from "./structured-data";

const school = { name: "Ecole Motion", url: "https://app.ecolemotion.com/" };

describe("données structurées", () => {
  it("formation vendue : prix en euros, école, mode en ligne", () => {
    const data = courseJsonLd({
      name: "Maîtriser After Effects",
      description: "De zéro à l'animation de logo",
      url: "https://app.ecolemotion.com/maitriser-after-effects",
      imageUrl: null,
      school,
      price: { amount: 19700, currency: "eur" },
    });
    expect(data["@type"]).toBe("Course");
    expect(data.provider).toEqual({ "@type": "EducationalOrganization", ...school });
    expect(data.offers).toMatchObject({ price: "197.00", priceCurrency: "EUR", category: "Paid" });
    expect(data).not.toHaveProperty("image");
  });

  it("formation sans vente en ligne : pas d'offre ; description par défaut", () => {
    const data = courseJsonLd({
      name: "Atelier",
      description: "",
      url: "https://x.fr/atelier",
      imageUrl: "https://x.fr/a.png",
      school,
      price: null,
    });
    expect(data).not.toHaveProperty("offers");
    expect(data.description).toBe("Atelier");
    expect(data.image).toBe("https://x.fr/a.png");
  });

  it("échappe « < » pour ne pas fermer la balise script", () => {
    const html = jsonLdScript(
      schoolJsonLd({ name: "</script><b>", url: "https://x.fr", logoUrl: null }),
    );
    expect(html).not.toContain("<");
    expect(JSON.parse(html).name).toBe("</script><b>");
  });
});
