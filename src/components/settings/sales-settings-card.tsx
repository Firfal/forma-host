"use client";

import { FileText, Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  INVOICING_MODES,
  UNPAID_POLICIES,
  type InvoicingMode,
  type SalesSettings,
  type UnpaidPolicy,
} from "@shared/sales-settings";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { callSaveSalesSettings, errorMessage } from "@/lib/firebase/callables";
import { useSalesSettings } from "@/lib/sales-settings";
import { useSchool } from "@/lib/school";

function Choice<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  options: Record<T, { label: string; description: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-[13px] font-semibold">{legend}</legend>
      {(Object.keys(options) as T[]).map((key) => (
        <label
          key={key}
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5",
            value === key ? "border-ink/40 bg-surface" : "border-line",
          )}
        >
          <input
            type="radio"
            name={name}
            checked={value === key}
            onChange={() => onChange(key)}
            className="mt-0.5 size-4 accent-[var(--color-ink)]"
          />
          <span>
            <span className="block text-[14px] font-medium">{options[key].label}</span>
            <span className="block text-[13px] text-muted">{options[key].description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** Réglages de vente : accès en cas d'impayé et établissement des factures. */
export function SalesSettingsCard() {
  const { schoolId } = useSchool();
  const { settings, loading } = useSalesSettings(schoolId);
  const [draft, setDraft] = useState<SalesSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const current = draft ?? settings;
  const dirty =
    draft !== null &&
    (draft.unpaidPolicy !== settings.unpaidPolicy || draft.invoicing !== settings.invoicing);

  async function save() {
    setSaving(true);
    try {
      await callSaveSalesSettings(current);
      setDraft(null);
      toast.success("Réglages de vente enregistrés");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Factures et impayés</CardTitle>
      </CardHeader>
      <CardBody className="space-y-5">
        {loading ? (
          <Skeleton className="h-64" />
        ) : (
          <>
            <Choice<InvoicingMode>
              name="invoicing"
              legend="Qui établit les factures de tes ventes ?"
              options={INVOICING_MODES}
              value={current.invoicing}
              onChange={(invoicing) => setDraft({ ...current, invoicing })}
            />
            <div className="flex gap-2.5 rounded-md bg-info-soft px-3 py-2.5 text-[13px] text-info">
              <Info className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-1.5">
                <p className="font-medium">Facturation électronique (réforme 2026-2027)</p>
                <p>
                  Les petites entreprises devront émettre leurs factures entre professionnels au
                  format électronique, et déclarer leurs ventes aux particuliers (e-reporting), via
                  une plateforme agréée par l&apos;administration à partir du 1er septembre 2027.
                  Forma Host et Stripe ne sont pas des plateformes agréées : pour ces obligations,
                  choisis « Mon outil de facturation » avec un outil relié à une plateforme agréée.
                </p>
                <p>
                  Les formations exonérées de TVA (article 261-4-4° du CGI, organisme de formation
                  déclaré) ne sont pas concernées par ces deux obligations.
                </p>
              </div>
            </div>
            <Choice<UnpaidPolicy>
              name="unpaid"
              legend="Paiement en plusieurs fois : l'élève perd l'accès en cas d'impayé…"
              options={UNPAID_POLICIES}
              value={current.unpaidPolicy}
              onChange={(unpaidPolicy) => setDraft({ ...current, unpaidPolicy })}
            />
            <p className="flex items-center gap-1.5 text-[12px] text-muted">
              <FileText className="size-3.5" /> Les ventes passées gardent le mode de facturation en
              vigueur au moment de l&apos;achat.
            </p>
            <div className="flex justify-end">
              <Button onClick={save} disabled={!dirty || saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
