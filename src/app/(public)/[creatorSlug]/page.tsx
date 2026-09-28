import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { routes } from "@shared/paths";
import { SchoolHome, schoolHomeMetadata } from "@/components/public/school-home";
import { getCreatorBySlug, getRenamedCreatorSlug } from "@/lib/public-data";

export const revalidate = 60;

// Page mise en cache (60 s) dès sa première visite, au lieu d'être recalculée à chaque visite.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ creatorSlug: string }>;
}): Promise<Metadata> {
  const creator = await getCreatorBySlug((await params).creatorSlug);
  if (!creator) return { title: { absolute: "Introuvable" } };
  return schoolHomeMetadata(creator);
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ creatorSlug: string }>;
}) {
  const { creatorSlug } = await params;
  const creator = await getCreatorBySlug(creatorSlug);
  if (!creator) {
    const renamed = await getRenamedCreatorSlug(creatorSlug);
    if (renamed) permanentRedirect(routes.creatorPage(renamed));
    notFound();
  }
  return <SchoolHome creator={creator} />;
}
