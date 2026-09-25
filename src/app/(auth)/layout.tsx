import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo";
import { brand } from "@/lib/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-surface px-4 py-10">
      <div className="mb-5 flex items-center gap-2.5">
        <LogoMark size={30} />
        <span className="text-lg font-bold tracking-tight">{brand.name}</span>
      </div>
      <div className="w-full max-w-sm rounded-card border border-line bg-white p-5">{children}</div>
    </main>
  );
}
