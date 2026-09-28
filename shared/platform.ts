/** Tableau de bord de la plateforme (administrateurs de la plateforme uniquement). */

export type StripeState = "none" | "pending" | "active";

export interface PlatformSchoolRow {
  id: string;
  name: string;
  slug: string;
  /** Date de création (ISO), null si inconnue. */
  createdAt: string | null;
  domain: string | null;
  domainActive: boolean;
  stripe: StripeState;
  courses: number;
  publishedCourses: number;
  /** Inscriptions actives (un élève inscrit à deux formations compte deux fois). */
  enrollments: number;
  sales: number;
  revenueCents: number;
}

export interface PlatformOverview {
  generatedAt: string;
  /** Ventes comptées dans le mode Stripe de la plateforme (test ou réel). */
  livemode: boolean;
  pendingRequests: number;
  totals: {
    schools: number;
    publishedCourses: number;
    enrollments: number;
    sales: number;
    revenueCents: number;
  };
  schools: PlatformSchoolRow[];
}

export function platformTotals(schools: PlatformSchoolRow[]): PlatformOverview["totals"] {
  return {
    schools: schools.length,
    publishedCourses: schools.reduce((sum, s) => sum + s.publishedCourses, 0),
    enrollments: schools.reduce((sum, s) => sum + s.enrollments, 0),
    sales: schools.reduce((sum, s) => sum + s.sales, 0),
    revenueCents: schools.reduce((sum, s) => sum + s.revenueCents, 0),
  };
}

/** Écoles triées : chiffre d'affaires, puis inscriptions, puis nom. */
export function sortSchools(schools: PlatformSchoolRow[]): PlatformSchoolRow[] {
  return [...schools].sort(
    (a, b) =>
      b.revenueCents - a.revenueCents ||
      b.enrollments - a.enrollments ||
      a.name.localeCompare(b.name, "fr"),
  );
}
