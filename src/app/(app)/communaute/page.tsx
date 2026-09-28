"use client";

import { doc } from "firebase/firestore";
import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { routes } from "@shared/paths";
import type { CreatorDoc } from "@shared/types";
import { PageContainer } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyCommunities } from "@/lib/community";
import { db } from "@/lib/firebase/client";
import { useDocsData } from "@/lib/hooks";

/** Communautés des écoles de l'élève (une seule : ouverte directement). */
export default function CommunitiesPage() {
  const router = useRouter();
  const { schoolIds, loading } = useMyCommunities();
  const refs = useMemo(
    () => schoolIds.map((id) => doc(db, "creators", id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schoolIds.join("|")],
  );
  const { data: schools } = useDocsData<CreatorDoc>(refs);

  useEffect(() => {
    if (!loading && schoolIds.length === 1) router.replace(routes.community(schoolIds[0]!));
  }, [loading, schoolIds, router]);

  return (
    <PageContainer width="narrow">
      <PageHeader title="Communauté" />
      {loading || schoolIds.length === 1 ? (
        <Skeleton className="h-32" />
      ) : schoolIds.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Pas encore de communauté"
          description="Quand l'école de ta formation ouvre sa communauté, tu la retrouves ici."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-line-soft">
            {schoolIds.map((id) => (
              <li key={id}>
                <Link
                  href={routes.community(id)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface/60"
                >
                  <Users className="size-4 text-muted" />
                  <span className="flex-1 font-medium">{schools.get(id)?.name ?? "École"}</span>
                  <ChevronRight className="size-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </PageContainer>
  );
}
