import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SchoolHome, schoolHomeMetadata } from "@/components/public/school-home";
import { getCreatorByDomain } from "@/lib/public-data";

// Domaine personnalisé d'une école (app.ecolemotion.com) : servi ici par les réécritures de
// next.config (ou, à défaut, par le middleware). Page mise en cache 60 s dès sa première visite.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

type Params = Promise<{ domain: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const creator = await getCreatorByDomain(decodeURIComponent((await params).domain));
  return creator ? schoolHomeMetadata(creator) : { title: { absolute: "Introuvable" } };
}

export default async function DomainHomePage({ params }: { params: Params }) {
  const creator = await getCreatorByDomain(decodeURIComponent((await params).domain));
  if (!creator) notFound();
  return <SchoolHome creator={creator} />;
}
