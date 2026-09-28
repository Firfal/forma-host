import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicSchoolUrl } from "@shared/host-routing";
import { resolveSalesPage } from "@shared/sales-page";
import { courseJsonLd, jsonLdScript } from "@shared/structured-data";
import { SalesPageView } from "@/components/sales/sales-page-view";
import { brand } from "@/lib/brand";
import {
  getExternalCtaUrl,
  getPreviewVideo,
  getPublishedCourse,
  getSchoolLegal,
  isCheckoutAvailable,
  type PublicCreator,
} from "@/lib/public-data";

/** Page de vente d'une formation publiée, sur l'adresse de la plateforme ou le domaine de l'école. */

export async function salesMetadata(creator: PublicCreator, courseSlug: string): Promise<Metadata> {
  const course = await getPublishedCourse(creator.id, courseSlug);
  if (!course) return { title: "Formation introuvable" };
  const page = resolveSalesPage(course, creator.name);
  const canonical = publicSchoolUrl(creator, brand.appUrl, course.slug);
  return {
    alternates: { canonical },
    title: { absolute: `${page.headline} · ${creator.name}` },
    description: page.subheadline || course.summary,
    openGraph: {
      title: page.headline,
      description: page.subheadline || course.summary,
      images: course.thumbnailUrl ? [{ url: course.thumbnailUrl }] : undefined,
      type: "website",
      url: canonical,
    },
  };
}

export async function SalesRoute({
  creator,
  courseSlug,
}: {
  creator: PublicCreator;
  courseSlug: string;
}) {
  const course = await getPublishedCourse(creator.id, courseSlug);
  if (!course) notFound();
  const [ctaUrl, preview, checkoutAvailable, legal] = await Promise.all([
    getExternalCtaUrl(course.id),
    getPreviewVideo(course),
    course.price ? isCheckoutAvailable(creator.id) : false,
    getSchoolLegal(creator.id),
  ]);
  const page = resolveSalesPage(course, creator.name);
  const checkout = checkoutAvailable && course.price ? { price: course.price } : null;
  const structuredData = courseJsonLd({
    name: course.title,
    description: page.subheadline || course.summary,
    url: publicSchoolUrl(creator, brand.appUrl, course.slug),
    imageUrl: course.thumbnailUrl,
    school: { name: creator.name, url: publicSchoolUrl(creator, brand.appUrl) },
    price: checkout?.price ?? null,
  });
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />
      <SalesPageView
        course={course}
        creator={creator}
        page={page}
        ctaUrl={ctaUrl}
        preview={preview}
        checkout={checkout}
        legal={legal ? { accessMonths: legal.accessMonths } : null}
      />
    </>
  );
}
