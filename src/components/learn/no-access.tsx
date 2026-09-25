import { Lock } from "lucide-react";
import Link from "next/link";
import { routes } from "@shared/paths";
import { PageContainer } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function NoAccess({ salesPath }: { salesPath?: string | null }) {
  return (
    <PageContainer width="narrow">
      <EmptyState
        icon={<Lock />}
        title="Tu n'as pas (encore) accès à cette formation"
        description="Si tu l'as achetée, vérifie que tu es connecté avec l'email utilisé lors de l'achat, ou contacte le formateur."
        action={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href={routes.myCourses}>Mes formations</Link>
            </Button>
            {salesPath ? (
              <Button asChild>
                <Link href={salesPath}>Voir la formation</Link>
              </Button>
            ) : null}
          </div>
        }
      />
    </PageContainer>
  );
}
