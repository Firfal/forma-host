import type { SchoolStripeDoc, OrderDoc, PlatformSettingsDoc } from "@shared/payments";
import {
  platformTotals,
  sortSchools,
  type PlatformOverview,
  type PlatformSchoolRow,
  type StripeState,
} from "@shared/platform";
import { sameStripeMode } from "@shared/payments";
import type { CreatorDoc } from "@shared/types";
import { db } from "./db";

function stripeState(stripe: SchoolStripeDoc | undefined, livemode: boolean): StripeState {
  if (!stripe || !sameStripeMode(stripe.livemode, livemode)) return "none";
  return stripe.chargesEnabled ? "active" : "pending";
}

/** Vue d'ensemble de la plateforme : écoles, formations, inscriptions et ventes. */
export async function platformOverview(): Promise<PlatformOverview> {
  const settings = (await db().doc("platform/settings").get()).data() as
    PlatformSettingsDoc | undefined;
  const livemode = Boolean(settings?.stripeLivemode);
  const [creators, pending] = await Promise.all([
    db().collection("creators").get(),
    db().collection("creatorRequests").where("status", "==", "pending").count().get(),
  ]);

  const schools = await Promise.all(
    creators.docs.map(async (doc): Promise<PlatformSchoolRow> => {
      const creator = doc.data() as CreatorDoc;
      const [courses, published, enrollments, orders, stripe] = await Promise.all([
        db().collection("courses").where("creatorId", "==", doc.id).count().get(),
        db()
          .collection("courses")
          .where("creatorId", "==", doc.id)
          .where("status", "==", "published")
          .count()
          .get(),
        db()
          .collection("enrollments")
          .where("creatorId", "==", doc.id)
          .where("status", "==", "active")
          .count()
          .get(),
        db()
          .collection("orders")
          .where("schoolId", "==", doc.id)
          .where("status", "==", "paid")
          .select("amount", "livemode")
          .get(),
        doc.ref.collection("private").doc("stripe").get(),
      ]);
      const paid = orders.docs
        .map((order) => order.data() as Pick<OrderDoc, "amount" | "livemode">)
        .filter((order) => sameStripeMode(order.livemode, livemode));
      const createdAt = creator.createdAt as { toDate?: () => Date } | undefined;
      return {
        id: doc.id,
        name: creator.name,
        slug: creator.slug,
        createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : null,
        domain: creator.customDomain?.host ?? null,
        domainActive: creator.customDomain?.status === "active",
        stripe: stripeState(stripe.data() as SchoolStripeDoc | undefined, livemode),
        courses: courses.data().count,
        publishedCourses: published.data().count,
        enrollments: enrollments.data().count,
        sales: paid.length,
        revenueCents: paid.reduce((sum, order) => sum + (order.amount ?? 0), 0),
      };
    }),
  );

  const sorted = sortSchools(schools);
  return {
    generatedAt: new Date().toISOString(),
    livemode,
    pendingRequests: pending.data().count,
    totals: platformTotals(sorted),
    schools: sorted,
  };
}
