import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { publicSchoolUrl } from "@shared/host-routing";
import type { CreatorDoc } from "@shared/types";
import { brand } from "@/lib/brand";
import { adminDb } from "@/lib/firebase/admin";
import { getCreatorByDomain, getPublishedCourses, type PublicCreator } from "@/lib/public-data";

async function schoolEntries(school: PublicCreator): Promise<MetadataRoute.Sitemap> {
  const courses = await getPublishedCourses(school.id);
  return [
    { url: publicSchoolUrl(school, brand.appUrl), changeFrequency: "weekly", priority: 0.8 },
    ...courses.map((course) => ({
      url: publicSchoolUrl(school, brand.appUrl, course.slug),
      lastModified: course.updatedAt?.toDate?.(),
      changeFrequency: "weekly" as const,
      priority: 1,
    })),
  ];
}

/**
 * Plan du site : sur le domaine d'une école, ses pages ; sur la plateforme, les écoles sans
 * domaine actif (celles qui en ont un sont référencées sur leur domaine).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .toLowerCase();
  const domainSchool = host ? await getCreatorByDomain(host).catch(() => null) : null;
  if (domainSchool) return schoolEntries(domainSchool);
  const creators = await adminDb.collection("creators").get();
  const schools = creators.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as CreatorDoc) }) as PublicCreator)
    .filter((school) => school.customDomain?.status !== "active");
  return (await Promise.all(schools.map(schoolEntries))).flat();
}
