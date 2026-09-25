import { describe, expect, it } from "vitest";
import { defaultSalesPage, resolveSalesPage } from "./sales-page";

const course = { title: "After Effects", summary: "Le motion design de A à Z.", salesPage: null };

describe("sales page", () => {
  it("dérive une page par défaut de la formation", () => {
    expect(resolveSalesPage(course, "Ecole Motion")).toEqual(
      defaultSalesPage(course, "Ecole Motion"),
    );
    expect(resolveSalesPage(course, "Ecole Motion").aboutTitle).toBe("Présenté par Ecole Motion");
  });

  it("complète les champs vides et filtre les entrées incomplètes", () => {
    const page = resolveSalesPage(
      {
        ...course,
        salesPage: {
          ...defaultSalesPage(course, "Ecole Motion"),
          headline: "  ",
          ctaLabel: "Je réserve ma place",
          testimonials: [
            { name: "Pierre", quote: "Top !" },
            { name: "Vide", quote: " " },
          ],
          faq: [
            { question: "Combien de temps ?", answer: "À vie." },
            { question: "Sans réponse", answer: "" },
          ],
        },
      },
      "Ecole Motion",
    );
    expect(page.headline).toBe("After Effects");
    expect(page.ctaLabel).toBe("Je réserve ma place");
    expect(page.testimonials).toHaveLength(1);
    expect(page.faq).toHaveLength(1);
  });
});
