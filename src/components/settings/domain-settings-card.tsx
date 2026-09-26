"use client";

import { CheckCircle2, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { schoolDomainInput, type DomainDnsRecord } from "@shared/domains";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCreator } from "@/lib/creator";
import {
  callAddSchoolDomain,
  callRefreshSchoolDomain,
  callRemoveSchoolDomain,
  errorMessage,
} from "@/lib/firebase/callables";
import { formatRelative } from "@/lib/format";
import { useSchool } from "@/lib/school";

function copy(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success("Copié"))
    .catch(() => toast.error("Copie impossible"));
}

function DnsRecords({ records }: { records: DomainDnsRecord[] }) {
  if (records.length === 0) {
    return (
      <p className="text-[13px] text-muted">
        Enregistrements DNS en cours de préparation : clique sur « Vérifier les DNS » dans quelques
        secondes.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-surface text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Action</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Nom</th>
            <th className="px-3 py-2 font-medium">Valeur</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {records.map((record) => (
            <tr key={`${record.action}-${record.type}-${record.name}-${record.value}`}>
              <td className="px-3 py-2">
                {record.action === "add" ? (
                  <Badge tone="info">Ajouter</Badge>
                ) : (
                  <Badge tone="danger">Supprimer</Badge>
                )}
              </td>
              <td className="px-3 py-2 font-mono">{record.type}</td>
              <td className="px-3 py-2 font-mono">{record.name}</td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => copy(record.value)}
                  className="inline-flex max-w-72 items-center gap-1.5 truncate font-mono hover:text-ink"
                  title="Copier"
                >
                  <span className="truncate">{record.value}</span>
                  <Copy className="size-3 shrink-0 text-muted" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Domaine personnalisé de l'école (ex. formation.ecolemotion.com). */
export function DomainSettingsCard() {
  const { schoolId } = useSchool();
  const { data: creator } = useCreator(schoolId);
  const domain = creator?.customDomain ?? null;
  const [host, setHost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"add" | "refresh" | "remove" | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    const parsed = schoolDomainInput.safeParse({ host });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Domaine invalide");
      return;
    }
    setBusy("add");
    try {
      const result = await callAddSchoolDomain(parsed.data);
      setHost("");
      toast.success(
        result.status === "active"
          ? `${result.host} est actif`
          : "Domaine ajouté : configure maintenant les enregistrements DNS",
      );
    } catch (err) {
      toast.error(errorMessage(err), { duration: 10_000 });
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy("refresh");
    try {
      const result = await callRefreshSchoolDomain();
      if (result.status === "active") toast.success(`${result.host} est actif`);
      else toast.info("Pas encore prêt : la propagation DNS peut prendre jusqu'à 24 h.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!domain || !window.confirm(`Retirer le domaine ${domain.host} ?`)) return;
    setBusy("remove");
    try {
      await callRemoveSchoolDomain();
      toast.success("Domaine retiré");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Domaine</CardTitle>
        {domain ? (
          domain.status === "active" ? (
            <Badge tone="success">Actif</Badge>
          ) : (
            <Badge tone="warning">En attente DNS</Badge>
          )
        ) : null}
      </CardHeader>
      <CardBody className="space-y-4">
        {!domain ? (
          <>
            <p className="text-[13px] text-muted">
              Ton école sur ta propre adresse, par exemple <strong>formation.tondomaine.com</strong>{" "}
              : ta page, tes pages de vente et l&apos;espace élève. Un sous-domaine est le plus
              simple à configurer. Le certificat HTTPS est créé automatiquement.
            </p>
            <form onSubmit={add} className="flex items-end gap-2" noValidate>
              <Field label="Domaine" htmlFor="school-domain" error={error} className="flex-1">
                <Input
                  id="school-domain"
                  value={host}
                  onChange={(e) => {
                    setHost(e.target.value);
                    setError(null);
                  }}
                  placeholder="formation.ecolemotion.com"
                  autoComplete="off"
                />
              </Field>
              <Button type="submit" disabled={busy !== null || !host.trim()}>
                {busy === "add" ? "Ajout…" : "Ajouter"}
              </Button>
            </form>
          </>
        ) : domain.status === "active" ? (
          <div className="flex gap-2.5 rounded-md bg-success-soft px-3 py-2.5 text-[13px] text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <p>
              Ton école est en ligne sur{" "}
              <a
                href={`https://${domain.host}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium underline"
              >
                {domain.host} <ExternalLink className="size-3" />
              </a>
              . Pense à ajouter ce domaine dans les réglages d&apos;intégration de tes vidéos Vimeo.
            </p>
          </div>
        ) : (
          <>
            <p className="text-[13px] text-muted">
              Chez l&apos;hébergeur du domaine <strong>{domain.host}</strong> (OVH, Gandi, IONOS…),
              zone DNS : crée ces enregistrements. Selon l&apos;hébergeur, le nom se saisit en
              entier ou seulement la partie avant ton domaine. La propagation peut prendre
              jusqu&apos;à 24 h.
            </p>
            <DnsRecords records={domain.records} />
            <p className="text-[12px] text-muted">
              Dernière vérification : {formatRelative(domain.checkedAt)}
            </p>
          </>
        )}

        {domain ? (
          <div className="flex flex-wrap items-center gap-2">
            {domain.status !== "active" ? (
              <Button onClick={refresh} disabled={busy !== null}>
                <RefreshCw className={busy === "refresh" ? "animate-spin" : undefined} />
                {busy === "refresh" ? "Vérification…" : "Vérifier les DNS"}
              </Button>
            ) : null}
            <Button
              variant="subtle"
              onClick={remove}
              disabled={busy !== null}
              className="sm:ml-auto"
            >
              Retirer le domaine
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
