import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { isLegalPageId } from "@shared/legal";
import { routes } from "@shared/paths";
import { LegalRoute, legalMetadata } from "@/components/public/legal-route";
import { getCreatorBySlug, getRenamedCreatorSlug } from "@/lib/public-data";

export const revalidate = 60;

// Page mise en cache (60 s) dès sa première visite, au lieu d'être recalculée à chaque visite.
export async function generateStaticParams() {
  return [];
}

interface Params {
  creatorSlug: string;
  page: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { creatorSlug, page } = await params;
  const creator = await getCreatorBySlug(creatorSlug);
  if (!creator) return { title: "Page introuvable" };
  return legalMetadata(creator, page);
}

export default async function LegalPageRoute({ params }: { params: Promise<Params> }) {
  const { creatorSlug, page } = await params;
  if (!isLegalPageId(page)) notFound();
  const creator = await getCreatorBySlug(creatorSlug);
  if (!creator) {
    const renamed = await getRenamedCreatorSlug(creatorSlug);
    if (renamed) permanentRedirect(routes.legalPage(renamed, page));
    notFound();
  }
  return <LegalRoute creator={creator} page={page} />;
}
