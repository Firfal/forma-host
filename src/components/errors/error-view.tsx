"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const RELOADED_KEY = "forma:rechargement-apres-mise-a-jour";

/** Code d'une ancienne version introuvable (nouveau déploiement pendant la visite). */
function isStaleBundle(error: Error): boolean {
  return (
    error.name === "ChunkLoadError" ||
    /Loading (CSS )?chunk|dynamically imported module|Importing a module script failed/i.test(
      error.message,
    )
  );
}

/**
 * Erreur inattendue d'une page : message en français, « Réessayer ». Après une mise à jour du
 * site, la page se recharge d'elle-même une fois pour récupérer la nouvelle version.
 */
export function ErrorView({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    if (!isStaleBundle(error)) return;
    try {
      if (window.sessionStorage.getItem(RELOADED_KEY)) return;
      window.sessionStorage.setItem(RELOADED_KEY, "1");
    } catch {
      return;
    }
    window.location.reload();
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-lg font-semibold">Oups, un problème est survenu</p>
      <p className="mt-2 text-[14px] text-muted">
        La page n&apos;a pas pu s&apos;afficher. Réessaie ; si le problème continue, recharge la
        page ou reviens un peu plus tard.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-muted">Référence : {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw /> Réessayer
        </Button>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Recharger la page
        </Button>
        <Button asChild variant="subtle">
          <Link href="/">Accueil</Link>
        </Button>
      </div>
    </div>
  );
}
