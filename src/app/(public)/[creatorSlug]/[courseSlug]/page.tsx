import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { routes } from "@shared/paths";
import { SalesRoute, salesMetadata } from "@/components/public/sales-route";
import { getCreatorBySlug, getRenamedCreatorSlug } from "@/lib/public-data";

export const revalidate = 60;

// Page mise en cache (60 s) dès sa première visite, au lieu d'être recalculée à chaque visite.
export async function generateStaticParams() {
  return [];
}

interface Params {
  creatorSlug: string;
  courseSlug: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { creatorSlug, courseSlug } = await params;
  const creator = await getCreatorBySlug(creatorSlug);
  if (!creator) return { title: "Formation introuvable" };
  return salesMetadata(creator, courseSlug);
}

export default async function SalesPageRoute({ params }: { params: Promise<Params> }) {
  const { creatorSlug, courseSlug } = await params;
  const creator = await getCreatorBySlug(creatorSlug);
  if (!creator) {
    const renamed = await getRenamedCreatorSlug(creatorSlug);
    if (renamed) permanentRedirect(routes.salesPage(renamed, courseSlug));
    notFound();
  }
  return <SalesRoute creator={creator} courseSlug={courseSlug} />;
}
