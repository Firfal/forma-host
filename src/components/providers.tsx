"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import { SchoolProvider } from "@/lib/school";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SchoolProvider>{children}</SchoolProvider>
      <Toaster position="bottom-right" toastOptions={{ className: "font-sans text-sm" }} />
    </AuthProvider>
  );
}
