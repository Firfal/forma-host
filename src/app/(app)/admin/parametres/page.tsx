"use client";

import { Suspense } from "react";
import { PageContainer } from "@/components/layout/page";
import { DomainSettingsCard } from "@/components/settings/domain-settings-card";
import { MailSettingsCard } from "@/components/settings/mail-settings-card";
import { PaymentsSettingsCard } from "@/components/settings/payments-settings-card";
import { SchoolSettingsCard } from "@/components/settings/school-settings-card";
import { TeamSettingsCard } from "@/components/settings/team-settings-card";
import { VimeoSettingsCard } from "@/components/settings/vimeo-settings-card";
import { PageHeader } from "@/components/ui/page-header";
import { useSchool } from "@/lib/school";

export default function SettingsPage() {
  const { schoolId, isOwner } = useSchool();
  return (
    <PageContainer width="narrow">
      <PageHeader title="Paramètres" />
      {/* key : formulaires réinitialisés quand on change d'école. */}
      <div key={schoolId ?? "aucune"} className="space-y-4">
        <SchoolSettingsCard />
        {isOwner ? (
          <>
            <TeamSettingsCard />
            <DomainSettingsCard />
            {/* useSearchParams (retour de Stripe) : rendu côté client uniquement. */}
            <Suspense fallback={null}>
              <PaymentsSettingsCard />
            </Suspense>
            <MailSettingsCard />
            <VimeoSettingsCard />
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
