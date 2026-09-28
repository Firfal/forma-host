import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalRoute, legalMetadata } from "@/components/public/legal-route";
import { getCreatorByDomain } from "@/lib/public-data";

// Domaine personnalisé d'une école (app.ecolemotion.com) : servi ici par les réécritures de
// next.config (ou, à défaut, par le middleware). Page mise en cache 60 s dès sa première visite.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

type Params = Promise<{ domain: string; page: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { domain, page } = await params;
  const creator = await getCreatorByDomain(decodeURIComponent(domain));
  return creator ? legalMetadata(creator, page) : { title: "Page introuvable" };
}

export default async function DomainLegalPage({ params }: { params: Params }) {
  const { domain, page } = await params;
  const creator = await getCreatorByDomain(decodeURIComponent(domain));
  if (!creator) notFound();
  return <LegalRoute creator={creator} page={page} />;
}
