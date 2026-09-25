"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { routes } from "@shared/paths";
import { useAuth } from "@/lib/auth";

export function FullPageSpinner() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center"
      role="status"
      aria-label="Chargement"
    >
      <span className="size-5 animate-spin rounded-full border-2 border-line border-t-ink" />
    </div>
  );
}

/** Redirige vers /connexion si l'utilisateur n'est pas connecté. */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`${routes.login}?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) return <FullPageSpinner />;
  return <>{children}</>;
}
