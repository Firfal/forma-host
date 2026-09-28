"use client";

import "./globals.css";
import { ErrorView } from "@/components/errors/error-view";

/** Erreur dans la mise en page racine elle-même : page complète, sans fournisseurs. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body>
        <ErrorView error={error} reset={reset} />
      </body>
    </html>
  );
}
