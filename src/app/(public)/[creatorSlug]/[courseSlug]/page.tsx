import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { routes } from "@shared/paths";
import { resolveSalesPage } from "@shared/sales-page";
import { SalesPageView } from "@/components/sales/sales-page-view";
import {
  getCreatorBySlug,
  getExternalCtaUrl,
  getPreviewVideo,
  getPublishedCourse,
  getRenamedCreatorSlug,
} from "@/lib/public-data";

export const revalidate = 60;

interface Params {
  creatorSlug: string;
  courseSlug: string;
}

async function load({ creatorSlug, courseSlug }: Params) {
  const creator = await getCreatorBySlug(creatorSlug);
  if (!creator) return null;
  const course = await getPublishedCourse(creator.id, courseSlug);
  return course ? { creator, course } : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const data = await load(await params);
  if (!data) return { title: "Formation introuvable" };
  const page = resolveSalesPage(data.course, data.creator.name);
  return {
    title: { absolute: `${page.headline} · ${data.creator.name}` },
    description: page.subheadline || data.course.summary,
    openGraph: {
      title: page.headline,
      description: page.subheadline || data.course.summary,
      images: data.course.thumbnailUrl ? [{ url: data.course.thumbnailUrl }] : undefined,
      type: "website",
    },
  };
}

export default async function SalesPageRoute({ params }: { params: Promise<Params> }) {
  const { creatorSlug, courseSlug } = await params;
  const data = await load({ creatorSlug, courseSlug });
  if (!data) {
    const renamed = await getRenamedCreatorSlug(creatorSlug);
    if (renamed) permanentRedirect(routes.salesPage(renamed, courseSlug));
    notFound();
  }
  const [ctaUrl, preview] = await Promise.all([
    getExternalCtaUrl(data.course.id),
    getPreviewVideo(data.course),
  ]);
  return (
    <SalesPageView
      course={data.course}
      creator={data.creator}
      page={resolveSalesPage(data.course, data.creator.name)}
      ctaUrl={ctaUrl}
      preview={preview}
    />
  );
}
