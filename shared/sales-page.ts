import type { CourseDoc, SalesPage } from "./types";

/** Page de vente par défaut, dérivée de la formation (tant que le formateur ne l'a pas personnalisée). */
export function defaultSalesPage(
  course: Pick<CourseDoc, "title" | "summary">,
  creatorName: string,
): SalesPage {
  return {
    announcement: "",
    headline: course.title,
    subheadline: course.summary,
    ctaLabel: "Rejoindre la formation",
    priceLabel: "",
    aboutTitle: `Présenté par ${creatorName}`,
    aboutText: "",
    testimonials: [],
    faq: [],
  };
}

export function resolveSalesPage(
  course: Pick<CourseDoc, "title" | "summary" | "salesPage">,
  creatorName: string,
): SalesPage {
  const defaults = defaultSalesPage(course, creatorName);
  const custom = course.salesPage;
  if (!custom) return defaults;
  return {
    ...defaults,
    ...custom,
    headline: custom.headline.trim() || defaults.headline,
    subheadline: custom.subheadline.trim() || defaults.subheadline,
    ctaLabel: custom.ctaLabel.trim() || defaults.ctaLabel,
    aboutTitle: custom.aboutTitle.trim() || defaults.aboutTitle,
    testimonials: custom.testimonials.filter((t) => t.quote.trim()),
    faq: custom.faq.filter((f) => f.question.trim() && f.answer.trim()),
  };
}
