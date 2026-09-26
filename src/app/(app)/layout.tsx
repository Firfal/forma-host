import type { ReactNode } from "react";
import { AuthGuard } from "@/components/layout/auth-guard";
import { PushRefresh } from "@/components/layout/push-refresh";
import { Sidebar } from "@/components/layout/sidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <PushRefresh />
      <div className="flex min-h-dvh flex-col md:flex-row">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </AuthGuard>
  );
}
