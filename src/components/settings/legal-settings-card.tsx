"use client";

import { AlertTriangle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  LEGAL_PAGE_IDS,
  LEGAL_PAGES,
  legalWarnings,
  schoolLegalInput,
  type SchoolLegalInfo,
} from "@shared/legal";
import { routes } from "@shared/paths";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useCreator } from "@/lib/creator";
import { callSaveSchoolLegal, errorMessage } from "@/lib/firebase/callables";
import { useSchoolLegal } from "@/lib/legal";
import { useSchool } from "@/lib/school";

interface LegalForm {
  companyName: string;
  legalForm: string;
  siret: string;
  address: string;
  vatMode: SchoolLegalInfo["vatMode"];
  vatNumber: string;
  publisherName: string;
  contactEmail: string;
  phone: string;
  mediatorName: string;
  mediatorUrl: string;
  refundDays: number;
  accessMonths: number | null;
  extraTerms: string;
}

type Errors = Partial<Record<keyof LegalForm, string>>;

const LEGAL_FORMS = [
  "Entreprise individuelle (micro-entreprise)",
  "Entreprise individuelle",
  "EURL",
  "SARL",
  "SASU",
  "SAS",
  "Association",
];

const VAT_MODES: { value: SchoolLegalInfo["vatMode"]; label: string }[] = [
  { value: "franchise", label: "Pas de TVA (franchise en base)" },
  { value: "standard", label: "TVA à 20 % incluse" },
  { value: "exempt", label: "Exonéré (organisme de formation)" },
];

/** Informations légales : mentions légales, CGV et politique de confidentialité de l'école. */
export function LegalSettingsCard() {
  const { schoolId } = useSchool();
  const { user } = useAuth();
  const { data: creator } = useCreator(schoolId);
  const { data: legal, loading } = useSchoolLegal(schoolId);
  const [form, setForm] = useState<LegalForm | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [showExtra, setShowExtra] = useState(false);

  useEffect(() => {
    if (form || loading || !creator) return;
    setForm({
      companyName: legal?.companyName ?? creator.name,
      legalForm: legal?.legalForm ?? "",
      siret: legal?.siret ?? "",
      address: legal?.address ?? "",
      vatMode: legal?.vatMode ?? "franchise",
      vatNumber: legal?.vatNumber ?? "",
      publisherName: legal?.publisherName ?? user?.displayName ?? "",
      contactEmail: legal?.contactEmail ?? creator.supportEmail ?? user?.email ?? "",
      phone: legal?.phone ?? "",
      mediatorName: legal?.mediatorName ?? "",
      mediatorUrl: legal?.mediatorUrl ?? "",
      refundDays: legal?.refundDays ?? 0,
      accessMonths: legal?.accessMonths ?? null,
      extraTerms: legal?.extraTerms ?? "",
    });
    setShowExtra(Boolean(legal?.extraTerms));
  }, [form, loading, legal, creator, user]);

  if (!form || !schoolId || !creator) {
    return (
      <Card>
        <CardBody className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-40" />
        </CardBody>
      </Card>
    );
  }

  function update<K extends keyof LegalForm>(key: K, value: LegalForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const parsed = schoolLegalInput.safeParse({ ...form, schoolId });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof LegalForm;
        next[key] ??= issue.message;
      }
      setErrors(next);
      toast.error("Vérifie les champs en rouge");
      return;
    }
    setSaving(true);
    try {
      await callSaveSchoolLegal({ ...form, schoolId });
      toast.success("Pages légales publiées");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const warnings = legal ? legalWarnings(legal) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Informations légales</CardTitle>
        {legal ? (
          <Badge tone={warnings.length ? "warning" : "success"}>
            {warnings.length ? "À compléter" : "Publiées"}
          </Badge>
        ) : (
          <Badge tone="warning">À remplir avant de vendre</Badge>
        )}
      </CardHeader>
      <CardBody>
        <p className="mb-4 text-[13px] text-muted">
          Ces informations génèrent les mentions légales, les CGV et la politique de confidentialité
          de ton école, obligatoires pour vendre en France. Elles apparaissent en bas de tes pages
          et au moment du paiement. Modèles fournis à titre indicatif : fais-les relire en cas de
          doute.
        </p>

        {warnings.length ? (
          <div className="mb-4 flex gap-2.5 rounded-md bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              {warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </div>
        ) : null}

        <form onSubmit={save} className="space-y-5" noValidate>
          <fieldset className="space-y-4">
            <legend className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">
              Entreprise
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Nom ou raison sociale"
                htmlFor="legal-company"
                error={errors.companyName}
              >
                <Input
                  id="legal-company"
                  value={form.companyName}
                  onChange={(e) => update("companyName", e.target.value)}
                  maxLength={120}
                />
              </Field>
              <Field label="Forme juridique" htmlFor="legal-form" error={errors.legalForm}>
                <Input
                  id="legal-form"
                  list="legal-forms"
                  value={form.legalForm}
                  onChange={(e) => update("legalForm", e.target.value)}
                  placeholder="Entreprise individuelle (micro-entreprise)"
                  maxLength={80}
                />
                <datalist id="legal-forms">
                  {LEGAL_FORMS.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </Field>
              <Field
                label="SIRET"
                htmlFor="legal-siret"
                error={errors.siret}
                hint="14 chiffres, sur ton avis de situation INSEE."
              >
                <Input
                  id="legal-siret"
                  value={form.siret}
                  onChange={(e) => update("siret", e.target.value)}
                  inputMode="numeric"
                  placeholder="123 456 789 00012"
                />
              </Field>
              <Field label="Adresse du siège" htmlFor="legal-address" error={errors.address}>
                <Input
                  id="legal-address"
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  placeholder="1 rue de la Paix, 75002 Paris"
                  maxLength={300}
                />
              </Field>
              <Field label="TVA" htmlFor="legal-vat-mode">
                <Select
                  id="legal-vat-mode"
                  value={form.vatMode}
                  onChange={(e) => update("vatMode", e.target.value as LegalForm["vatMode"])}
                >
                  {VAT_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {form.vatMode === "standard" ? (
                <Field
                  label="Numéro de TVA intracommunautaire"
                  htmlFor="legal-vat-number"
                  error={errors.vatNumber}
                >
                  <Input
                    id="legal-vat-number"
                    value={form.vatNumber}
                    onChange={(e) => update("vatNumber", e.target.value)}
                    placeholder="FR12345678901"
                    maxLength={20}
                  />
                </Field>
              ) : null}
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">
              Contact
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Directeur de la publication"
                htmlFor="legal-publisher"
                error={errors.publisherName}
                hint="La personne responsable du contenu du site."
              >
                <Input
                  id="legal-publisher"
                  value={form.publisherName}
                  onChange={(e) => update("publisherName", e.target.value)}
                  maxLength={120}
                />
              </Field>
              <Field
                label="Email de contact"
                htmlFor="legal-email"
                error={errors.contactEmail}
                hint="Réclamations, remboursements, données personnelles."
              >
                <Input
                  id="legal-email"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => update("contactEmail", e.target.value)}
                />
              </Field>
              <Field label="Téléphone (facultatif)" htmlFor="legal-phone" error={errors.phone}>
                <Input
                  id="legal-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  maxLength={30}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">
              Vente
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Médiateur de la consommation"
                htmlFor="legal-mediator"
                error={errors.mediatorName}
                hint={
                  <>
                    Obligatoire pour vendre à des particuliers.{" "}
                    <a
                      href="https://www.economie.gouv.fr/mediation-conso"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-ink"
                    >
                      Liste des médiateurs
                    </a>
                  </>
                }
              >
                <Input
                  id="legal-mediator"
                  value={form.mediatorName}
                  onChange={(e) => update("mediatorName", e.target.value)}
                  placeholder="CM2C"
                  maxLength={200}
                />
              </Field>
              <Field
                label="Site du médiateur"
                htmlFor="legal-mediator-url"
                error={errors.mediatorUrl}
              >
                <Input
                  id="legal-mediator-url"
                  type="url"
                  value={form.mediatorUrl}
                  onChange={(e) => update("mediatorUrl", e.target.value)}
                  placeholder="https://www.cm2c.net"
                />
              </Field>
              <Field
                label="Garantie « satisfait ou remboursé »"
                htmlFor="legal-refund"
                hint="Facultatif : sinon, pas de rétractation après l'accès."
              >
                <Select
                  id="legal-refund"
                  value={form.refundDays}
                  onChange={(e) => update("refundDays", Number(e.target.value))}
                >
                  <option value={0}>Aucune</option>
                  <option value={7}>7 jours</option>
                  <option value={14}>14 jours</option>
                  <option value={30}>30 jours</option>
                </Select>
              </Field>
              <Field label="Durée d'accès aux formations" htmlFor="legal-access">
                <Select
                  id="legal-access"
                  value={form.accessMonths ?? 0}
                  onChange={(e) => update("accessMonths", Number(e.target.value) || null)}
                >
                  <option value={0}>Sans limite</option>
                  <option value={12}>12 mois</option>
                  <option value={24}>24 mois</option>
                  <option value={36}>36 mois</option>
                </Select>
              </Field>
            </div>
            {showExtra ? (
              <Field
                label="Clauses ajoutées aux CGV"
                htmlFor="legal-extra"
                error={errors.extraTerms}
                hint="Laisse une ligne vide entre deux paragraphes."
              >
                <Textarea
                  id="legal-extra"
                  value={form.extraTerms}
                  onChange={(e) => update("extraTerms", e.target.value)}
                  maxLength={5000}
                  rows={4}
                />
              </Field>
            ) : (
              <Button variant="link" size="sm" className="px-0" onClick={() => setShowExtra(true)}>
                Ajouter des clauses aux CGV
              </Button>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
            <Button type="submit" disabled={saving}>
              {saving ? "Publication…" : legal ? "Enregistrer" : "Publier les pages légales"}
            </Button>
            {legal
              ? LEGAL_PAGE_IDS.map((page) => (
                  <Button key={page} asChild variant="ghost" size="sm">
                    <Link href={routes.legalPage(creator.slug, page)} target="_blank">
                      <ExternalLink /> {LEGAL_PAGES[page]}
                    </Link>
                  </Button>
                ))
              : null}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
