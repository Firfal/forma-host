import type { Metadata } from "next";
import { Award } from "lucide-react";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { certificateDuration, type CertificateDoc } from "@shared/certificates";
import type { CreatorDoc, TimestampLike } from "@shared/types";
import { LogoMark } from "@/components/logo";
import { PrintButton } from "@/components/print/print-button";
import { brand } from "@/lib/brand";
import { adminDb } from "@/lib/firebase/admin";
import { formatDate } from "@/lib/format";

export const revalidate = 300;

async function load(id: string) {
  if (!/^[\w-]{8,64}$/.test(id)) return null;
  const snap = await adminDb.doc(`certificates/${id}`).get();
  const certificate = snap.data() as CertificateDoc<TimestampLike> | undefined;
  if (!certificate) return null;
  const creator = (await adminDb.doc(`creators/${certificate.schoolId}`).get()).data() as
    CreatorDoc | undefined;
  return { certificate, creator };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const data = await load((await params).id);
  return {
    title: data
      ? {
          absolute: `Certificat · ${data.certificate.studentName} · ${data.certificate.courseTitle}`,
        }
      : "Certificat introuvable",
    robots: { index: false },
  };
}

/** Certificat de réussite, public (vérification) et imprimable en PDF (A4 paysage). */
export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  const { certificate, creator } = data;
  const brandColor =
    creator && /^#[0-9a-f]{6}$/i.test(creator.brandColor) ? creator.brandColor : "#5a0eb5";
  const duration = certificateDuration(certificate.durationSec);
  const verifyUrl = `${brand.appUrl.replace(/^https?:\/\//, "")}/certificats/${id}`;

  return (
    <div
      style={{ "--brand": brandColor } as CSSProperties}
      className="print-certificate min-h-dvh bg-surface px-4 py-8 print:bg-white print:p-0"
    >
      <div className="mx-auto mb-4 flex max-w-4xl items-center justify-between gap-3 print:hidden">
        <p className="flex items-center gap-2 text-[13px] text-success">
          <Award className="size-4" /> Certificat authentique, délivré par {certificate.schoolName}
        </p>
        <PrintButton />
      </div>
      <article className="relative mx-auto flex max-w-4xl flex-col overflow-hidden rounded-lg border border-line bg-white shadow-sm sm:aspect-[297/210] print:aspect-auto print:h-dvh print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <div className="h-3 bg-[var(--brand)]" />
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center sm:py-0 md:px-16">
          <div className="flex items-center gap-2.5">
            {creator?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creator.logoUrl} alt="" className="size-10 rounded-lg object-cover" />
            ) : (
              <LogoMark size={36} />
            )}
            <span className="text-lg font-semibold">{certificate.schoolName}</span>
          </div>
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--brand)] md:mt-10 md:text-[13px]">
            Certificat de réussite
          </p>
          <p className="mt-3 text-[13px] text-muted md:mt-5">décerné à</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-5xl">
            {certificate.studentName}
          </h1>
          <p className="mt-3 max-w-xl text-[13px] text-muted md:mt-6 md:text-base">
            pour avoir suivi l&apos;intégralité de la formation
          </p>
          <p className="mt-1 max-w-2xl text-base font-semibold md:text-2xl">
            {certificate.courseTitle}
          </p>
          <p className="mt-2 text-[12px] text-muted md:text-[13px]">
            {certificate.lessonCount} leçons{duration ? ` · ${duration}` : ""}
          </p>
        </div>
        <footer className="flex items-end justify-between gap-4 border-t border-line-soft px-6 py-3 text-[10px] text-muted md:px-10 md:py-5 md:text-[12px]">
          <div>
            <p className="font-medium text-ink">{formatDate(certificate.issuedAt)}</p>
            <p>Date de délivrance</p>
          </div>
          <div className="text-right">
            <p>Vérifiable sur {verifyUrl}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
