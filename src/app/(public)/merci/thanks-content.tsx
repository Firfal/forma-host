"use client";

import { doc } from "firebase/firestore";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { enrollmentId, routes } from "@shared/paths";
import type { EnrollmentDoc } from "@shared/types";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase/client";
import { useDocData } from "@/lib/hooks";

/** Retour de Stripe après paiement : l'accès est donné par le webhook, en quelques secondes. */
export function ThanksContent() {
  const params = useSearchParams();
  const courseId = params.get("formation");
  const { user, loading } = useAuth();
  const ref = useMemo(
    () => (user && courseId ? doc(db, "enrollments", enrollmentId(courseId, user.uid)) : null),
    [user, courseId],
  );
  const { data: enrollment } = useDocData<EnrollmentDoc>(ref);
  const ready = enrollment?.status === "active";

  return (
    <div className="space-y-4 text-center">
      <CheckCircle2 className="mx-auto size-10 text-success" />
      <h1 className="text-xl font-semibold">Merci pour ton achat !</h1>
      <p className="text-sm text-muted">
        Ton paiement est confirmé. Tu vas recevoir un email avec ton accès à la formation (pense
        à vérifier tes spams).
      </p>
      {loading ? null : user && courseId ? (
        ready ? (
          <Button asChild>
            <Link href={routes.course(courseId)}>Commencer la formation</Link>
          </Button>
        ) : (
          <p className="flex items-center justify-center gap-2 text-[13px] text-muted">
            <Loader2 className="size-4 animate-spin" /> Activation de ton accès…
          </p>
        )
      ) : (
        <p className="text-[13px] text-muted">
          Tu as déjà un compte ?{" "}
          <Link href={routes.login} className="font-medium text-ink underline">
            Connecte-toi
          </Link>{" "}
          avec l&apos;email utilisé pour le paiement.
        </p>
      )}
    </div>
  );
}
