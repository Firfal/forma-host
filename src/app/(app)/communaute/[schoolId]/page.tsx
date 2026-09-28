"use client";

import { doc } from "firebase/firestore";
import { Users } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import type { CommunityDoc } from "@shared/community";
import { CommunityFeed } from "@/components/community/community-feed";
import { PageContainer } from "@/components/layout/page";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreator } from "@/lib/creator";
import { db } from "@/lib/firebase/client";
import { useDocData } from "@/lib/hooks";
import { useSchoolStaff } from "@/lib/school";

/** Communauté d'une école, côté élève. */
export default function CommunityPage() {
  const { schoolId } = useParams<{ schoolId: string }>();
  const { data: school } = useCreator(schoolId);
  const staff = useSchoolStaff(schoolId);
  const ref = useMemo(() => doc(db, "communities", schoolId), [schoolId]);
  const { data: community, loading } = useDocData<CommunityDoc>(ref);

  return (
    <PageContainer width="narrow">
      <PageHeader title="Communauté" breadcrumb={school?.name} />
      {loading ? (
        <Skeleton className="h-48" />
      ) : community?.enabled ? (
        <CommunityFeed schoolId={schoolId} staff={staff} />
      ) : (
        <EmptyState
          icon={<Users />}
          title="Communauté fermée"
          description="L'école n'a pas (ou plus) de communauté ouverte."
        />
      )}
    </PageContainer>
  );
}
