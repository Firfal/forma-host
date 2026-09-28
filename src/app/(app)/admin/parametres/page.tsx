"use client";

import Link from "next/link";
import { Suspense, useEffect, type ReactNode } from "react";
import { PageContainer } from "@/components/layout/page";
import { DomainSettingsCard } from "@/components/settings/domain-settings-card";
import { LegalSettingsCard } from "@/components/settings/legal-settings-card";
import { MailSettingsCard } from "@/components/settings/mail-settings-card";
import { PaymentsSettingsCard } from "@/components/settings/payments-settings-card";
import { SchoolSettingsCard } from "@/components/settings/school-settings-card";
import { TeamSettingsCard } from "@/components/settings/team-settings-card";
import { VimeoSettingsCard } from "@/components/settings/vimeo-settings-card";
import { WebhooksSettingsCard } from "@/components/settings/webhooks-settings-card";
import { PageHeader } from "@/components/ui/page-header";
import { useSchool } from "@/lib/school";
import { SETTINGS_SECTIONS } from "@/lib/setup";

type SectionKey = keyof typeof SETTINGS_SECTIONS;

const OWNER_SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "school", label: "École" },
  { key: "team", label: "Équipe" },
  { key: "domain", label: "Domaine" },
  { key: "legal", label: "Informations légales" },
  { key: "payments", label: "Paiements" },
  { key: "mail", label: "Emails" },
  { key: "vimeo", label: "Vimeo" },
  { key: "integrations", label: "Intégrations" },
];

function Section({ id, children }: { id: SectionKey; children: ReactNode }) {
  return (
    <section id={SETTINGS_SECTIONS[id]} className="scroll-mt-16 md:scroll-mt-6">
      {children}
    </section>
  );
}

/** Lien vers une section (#paiements…) : les cartes se chargent après la navigation. */
function useScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const timer = window.setTimeout(
      () => document.getElementById(id)?.scrollIntoView({ block: "start" }),
      400,
    );
    return () => window.clearTimeout(timer);
  }, []);
}

export default function SettingsPage() {
  const { schoolId, isOwner } = useSchool();
  useScrollToHash();
  return (
    <PageContainer width="narrow">
      <PageHeader title="Paramètres" />
      {isOwner ? (
        <nav aria-label="Sections des paramètres" className="-mt-2 mb-4 flex flex-wrap gap-1.5">
          {OWNER_SECTIONS.map(({ key, label }) => (
            <Link
              key={key}
              href={`#${SETTINGS_SECTIONS[key]}`}
              className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted hover:border-ink/30 hover:text-ink"
            >
              {label}
            </Link>
          ))}
        </nav>
      ) : null}
      {/* key : formulaires réinitialisés quand on change d'école. */}
      <div key={schoolId ?? "aucune"} className="space-y-4">
        <Section id="school">
          <SchoolSettingsCard />
        </Section>
        {isOwner ? (
          <>
            <Section id="team">
              <TeamSettingsCard />
            </Section>
            <Section id="domain">
              <DomainSettingsCard />
            </Section>
            <Section id="legal">
              <LegalSettingsCard />
            </Section>
            <Section id="payments">
              {/* useSearchParams (retour de Stripe) : rendu côté client uniquement. */}
              <Suspense fallback={null}>
                <PaymentsSettingsCard />
              </Suspense>
            </Section>
            <Section id="mail">
              <MailSettingsCard />
            </Section>
            <Section id="vimeo">
              <VimeoSettingsCard />
            </Section>
            <Section id="integrations">
              <WebhooksSettingsCard />
            </Section>
          </>
        ) : (
          <p className="rounded-md bg-surface px-3 py-2.5 text-[13px] text-muted">
            L&apos;équipe, l&apos;envoi des emails et Vimeo sont réglés par le propriétaire de
            l&apos;école.
          </p>
        )}
      </div>
    </PageContainer>
  );
}
