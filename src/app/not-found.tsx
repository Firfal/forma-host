import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page introuvable" };

/** 404 : lien cassé, formation dépubliée, adresse mal saisie. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-5xl font-bold tracking-tight text-line">404</p>
      <h1 className="mt-4 text-lg font-semibold">Page introuvable</h1>
      <p className="mt-2 text-[14px] text-muted">
        Cette page n&apos;existe pas ou n&apos;est plus disponible. Vérifie l&apos;adresse, ou
        repars de l&apos;accueil.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/">Accueil</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/formations">Mes formations</Link>
        </Button>
      </div>
    </main>
  );
}
