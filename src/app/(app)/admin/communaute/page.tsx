"use client";

import { doc } from "firebase/firestore";
import { Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { CommunityDoc } from "@shared/community";
import { CommunityFeed } from "@/components/community/community-feed";
import { PageContainer } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { callSetCommunity, errorMessage } from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { useDocData } from "@/lib/hooks";
import { useSchool, useSchoolStaff } from "@/lib/school";

/** Communauté de l'école côté équipe : activation, modération, épingles. */
export default function AdminCommunityPage() {
  const { schoolId } = useSchool();
  const staff = useSchoolStaff(schoolId);
  const ref = useMemo(() => (schoolId ? doc(db, "communities", schoolId) : null), [schoolId]);
  const { data: community, loading } = useDocData<CommunityDoc>(ref);
  const [busy, setBusy] = useState(false);

  async function toggle(enabled: boolean) {
    if (!schoolId) return;
    if (!enabled && !window.confirm("Fermer la communauté ? Les messages sont conservés.")) return;
    setBusy(true);
    try {
      await callSetCommunity({ schoolId, enabled });
      toast.success(enabled ? "Communauté ouverte à tes élèves" : "Communauté fermée");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Communauté"
        actions={
          community?.enabled ? (
            <Button variant="ghost" size="sm" onClick={() => toggle(false)} disabled={busy}>
              Fermer la communauté
            </Button>
          ) : null
        }
      />
      {loading || !schoolId ? (
        <Skeleton className="h-48" />
      ) : community?.enabled ? (
        <CommunityFeed schoolId={schoolId} staff={staff} />
      ) : (
        <EmptyState
          icon={<Users />}
          title="Un espace d'échange pour tes élèves"
          description="Tes élèves (inscrits à au moins une formation) s'entraident, partagent leurs projets et posent leurs questions ; tu épingles les messages importants. Rien n'est visible en dehors de ton école."
          action={
            <Button onClick={() => toggle(true)} disabled={busy}>
              {busy ? "Ouverture…" : "Ouvrir la communauté"}
            </Button>
          }
        />
      )}
    </PageContainer>
  );
}
