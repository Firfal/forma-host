import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { schoolHref } from "@shared/host-routing";
import { isLegalPageId, LEGAL_PAGES, legalPage } from "@shared/legal";
import { routes } from "@shared/paths";
import { LogoMark } from "@/components/logo";
import { SchoolFooter } from "@/components/sales/school-footer";
import { brand } from "@/lib/brand";
import { formatDate } from "@/lib/format";
import { getCreatorBySlug, getRenamedCreatorSlug, getSchoolLegal } from "@/lib/public-data";

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
  if (!creator || !isLegalPageId(page)) return { title: "Page introuvable" };
  return { title: { absolute: `${LEGAL_PAGES[page]} · ${creator.name}` } };
}

/** Mentions légales, CGV ou politique de confidentialité d'une école. */
export default async function LegalPageRoute({ params }: { params: Promise<Params> }) {
  const { creatorSlug, page } = await params;
  if (!isLegalPageId(page)) notFound();
  const creator = await getCreatorBySlug(creatorSlug);
  if (!creator) {
    const renamed = await getRenamedCreatorSlug(creatorSlug);
    if (renamed) permanentRedirect(routes.legalPage(renamed, page));
    notFound();
  }
  const legal = await getSchoolLegal(creator.id);
  if (!legal) notFound();
  const content = legalPage(page, legal, { schoolName: creator.name, platformName: brand.name });
  const updatedAt = (legal.updatedAt as { toDate?: () => Date } | null)?.toDate?.() ?? null;

  return (
    <div className="min-h-dvh bg-white">
      <header className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-5">
        <Link href={schoolHref(creator)} className="flex items-center gap-2">
          {creator.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creator.logoUrl} alt="" className="size-7 rounded-md object-cover" />
          ) : (
            <LogoMark size={26} />
          )}
          <span className="font-semibold">{creator.name}</span>
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
        {updatedAt ? (
          <p className="mt-2 text-[13px] text-muted">Mise à jour le {formatDate(updatedAt)}</p>
        ) : null}
        <div className="mt-8 space-y-8">
          {content.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold">{section.heading}</h2>
              <div className="mt-2 space-y-2 text-[15px] leading-7 text-ink/85">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <SchoolFooter school={creator} hasLegal />
    </div>
  );
}
