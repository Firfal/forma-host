import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { SalesRoute, salesMetadata } from "@/components/public/sales-route";
import { getCreatorByDomain } from "@/lib/public-data";

// Domaine personnalisé d'une école (app.ecolemotion.com) : servi ici par les réécritures de
// next.config (ou, à défaut, par le middleware). Page mise en cache 60 s dès sa première visite.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

type Params = Promise<{ domain: string; courseSlug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { domain, courseSlug } = await params;
  const creator = await getCreatorByDomain(decodeURIComponent(domain));
  return creator ? salesMetadata(creator, courseSlug) : { title: "Formation introuvable" };
}

export default async function DomainSalesPage({ params }: { params: Params }) {
  const { domain, courseSlug } = await params;
  const creator = await getCreatorByDomain(decodeURIComponent(domain));
  if (!creator) notFound();
  // /ecole-motion sur le domaine de l'école : c'est son accueil.
  if (courseSlug === creator.slug) permanentRedirect("/");
  return <SalesRoute creator={creator} courseSlug={courseSlug} />;
}
