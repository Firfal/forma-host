import type { Metadata } from "next";
import { Suspense } from "react";
import { ThanksContent } from "./thanks-content";

export const metadata: Metadata = { title: "Merci pour ton achat", robots: { index: false } };

export default function ThanksPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12">
      <Suspense fallback={null}>
        <ThanksContent />
      </Suspense>
    </main>
  );
}
