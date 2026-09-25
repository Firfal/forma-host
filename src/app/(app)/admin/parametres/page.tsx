"use client";

import { PageContainer } from "@/components/layout/page";
import { MailSettingsCard } from "@/components/settings/mail-settings-card";
import { PageHeader } from "@/components/ui/page-header";

export default function SettingsPage() {
  return (
    <PageContainer width="narrow">
      <PageHeader title="Paramètres" />
      <MailSettingsCard />
    </PageContainer>
  );
}
