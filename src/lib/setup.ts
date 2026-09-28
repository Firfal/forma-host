import { routes } from "@shared/paths";
import type { CourseStatus, OutlineItem } from "@shared/types";

/**
 * « Premiers pas » d'une école (accueil formateur) : les étapes pour ouvrir son école, cochées
 * d'après les données déjà présentes. L'envoi des emails a son propre bandeau.
 */

export interface SetupStep {
  id: string;
  label: string;
  hint: string;
  href: string;
  done: boolean;
}

/** Sections de Paramètres (ancres). */
export const SETTINGS_SECTIONS = {
  school: "ecole",
  team: "equipe",
  domain: "domaine",
  legal: "informations-legales",
  payments: "paiements",
  mail: "emails",
  vimeo: "vimeo",
  integrations: "integrations",
} as const;

export const settingsSection = (section: keyof typeof SETTINGS_SECTIONS) =>
  `${routes.adminSettings}#${SETTINGS_SECTIONS[section]}`;

export function setupSteps(input: {
  logoUrl: string | null | undefined;
  courses: { id: string; status: CourseStatus; items: OutlineItem[] }[];
  hasLegal: boolean;
  /** Paiements activés sur la plateforme, et compte Stripe de l'école prêt. */
  payments: { enabled: boolean; active: boolean };
  hasStudents: boolean;
}): SetupStep[] {
  const { courses } = input;
  // Formation mise en avant par les liens : une publiée, sinon la première.
  const course = courses.find((c) => c.status === "published") ?? courses[0];
  const withLesson = courses.find((c) => c.items.some((item) => item.kind === "lesson"));
  const steps: SetupStep[] = [
    {
      id: "school",
      label: "Personnalise ton école",
      hint: "Logo et couleur, repris sur tes pages et dans l'espace de tes élèves",
      href: settingsSection("school"),
      done: Boolean(input.logoUrl),
    },
    {
      id: "course",
      label: "Crée ta première formation",
      hint: "Un titre suffit pour commencer",
      href: routes.adminCourses,
      done: courses.length > 0,
    },
    {
      id: "lesson",
      label: "Ajoute une première leçon",
      hint: "Vidéo Vimeo, texte, fichiers, quiz…",
      href: course ? routes.adminCourseContent(course.id) : routes.adminCourses,
      done: Boolean(withLesson),
    },
    {
      id: "publish",
      label: "Publie ta formation",
      hint: "Elle apparaît alors sur ta page d'école",
      href: course ? routes.adminCourse(course.id) : routes.adminCourses,
      done: courses.some((c) => c.status === "published"),
    },
    {
      id: "legal",
      label: "Complète tes informations légales",
      hint: "Pour tes CGV, mentions légales et factures",
      href: settingsSection("legal"),
      done: input.hasLegal,
    },
  ];
  if (input.payments.enabled) {
    steps.push({
      id: "payments",
      label: "Relie ton compte Stripe",
      hint: "Pour vendre tes formations en ligne",
      href: settingsSection("payments"),
      done: input.payments.active,
    });
  }
  steps.push({
    id: "student",
    label: "Inscris ton premier élève",
    hint: "Invitation par email ou import depuis ton ancienne plateforme",
    href: course ? routes.adminCourse(course.id) : routes.adminCourses,
    done: input.hasStudents,
  });
  return steps;
}
