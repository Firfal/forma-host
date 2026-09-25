"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { routes } from "@shared/paths";
import { PageContainer } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { isCreator } = useAuth();
  if (!isCreator) {
    return (
      <PageContainer width="narrow">
        <EmptyState
          title="Espace réservé aux formateurs"
          description="Ton compte n'a pas encore accès à l'espace formateur."
          action={
            <Button asChild variant="secondary">
              <Link href={routes.myCourses}>Voir mes formations</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }
  return <>{children}</>;
}
