"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Impression (ou enregistrement en PDF) de la page. */
export function PrintButton({ label = "Télécharger en PDF" }: { label?: string }) {
  return (
    <Button size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer /> {label}
    </Button>
  );
}
