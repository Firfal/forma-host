import type { ReactNode } from "react";
import { AuthGuard } from "@/components/layout/auth-guard";

/** Documents imprimables (factures, certificats) : sans barre latérale. */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
