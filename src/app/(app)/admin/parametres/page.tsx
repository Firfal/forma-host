"use client";

import { PageContainer } from "@/components/layout/page";
import { MailSettingsCard } from "@/components/settings/mail-settings-card";
import { SchoolSettingsCard } from "@/components/settings/school-settings-card";
import { VimeoSettingsCard } from "@/components/settings/vimeo-settings-card";
import { PageHeader } from "@/components/ui/page-header";

export default function SettingsPage() {
  return (
    <PageContainer width="narrow">
      <PageHeader title="Paramètres" />
      <div className="space-y-4">
        <SchoolSettingsCard />
        <MailSettingsCard />
        <VimeoSettingsCard />
      </div>
    </PageContainer>
  );
}
