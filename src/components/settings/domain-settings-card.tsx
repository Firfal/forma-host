"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  DNS_PROVIDERS,
  domainPhase,
  recordNeedsAction,
  registrableDomain,
  relativeRecordName,
  schoolDomainInput,
  type DomainDnsRecord,
  type DomainPhase,
  type SchoolDomain,
} from "@shared/domains";
import type { TimestampLike } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { useCreator } from "@/lib/creator";
import {
  callAddSchoolDomain,
  callRefreshSchoolDomain,
  callRemoveSchoolDomain,
  errorMessage,
} from "@/lib/firebase/callables";
import { formatRelative } from "@/lib/format";
import { useSchool } from "@/lib/school";

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => toast.error("Copie impossible : sélectionne le texte à la main"))
      }
      aria-label={`Copier ${label} : ${value}`}
      title="Copier"
      className="flex w-full items-start justify-between gap-2 rounded bg-surface px-2 py-1.5 text-left font-mono text-[13px] hover:bg-line-soft"
    >
      <span className="min-w-0 break-all">{value}</span>
      {copied ? (
        <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
      ) : (
        <Copy className="mt-0.5 size-3.5 shrink-0 text-muted" />
      )}
    </button>
  );
}

const PURPOSE_LABELS = {
  host: "Diriger l'adresse vers ton école",
  ownership: "Prouver que le domaine t'appartient",
  cert: "Autoriser le certificat HTTPS",
  other: "Enregistrement requis",
};

function RecordStatus({ record }: { record: DomainDnsRecord }) {
  const className = "shrink-0 whitespace-nowrap";
  if (record.action === "ok") {
    return (
      <Badge tone="success" className={className}>
        En place
      </Badge>
    );
  }
  if (record.action === "remove") {
    return record.found === false ? (
      <Badge tone="success" className={className}>
        Supprimé
      </Badge>
    ) : (
      <Badge tone="danger" className={className}>
        À supprimer
      </Badge>
    );
  }
  return record.found ? (
    <Badge tone="success" className={className}>
      Détecté
    </Badge>
  ) : (
    <Badge tone="warning" className={className}>
      À ajouter
    </Badge>
  );
}

function RecordItem({ record, zone }: { record: DomainDnsRecord; zone: string }) {
  const done = !recordNeedsAction(record);
  return (
    <li className={cn("rounded-md border border-line", done && "bg-surface/40")}>
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
        <span className="text-[13px] font-medium">
          {record.action === "remove"
            ? "Ancien enregistrement en conflit"
            : PURPOSE_LABELS[record.purpose ?? "other"]}
        </span>
        <RecordStatus record={record} />
      </div>
      <dl className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 p-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1.6fr)]">
        <div>
          <dt className="mb-1 text-[12px] text-muted">Type</dt>
          <dd className="px-2 py-1.5 font-mono text-[13px] font-medium">{record.type}</dd>
        </div>
        <div>
          <dt className="mb-1 text-[12px] text-muted">Nom (ou hôte)</dt>
          <dd>
            <CopyValue value={relativeRecordName(record.name, zone)} label="le nom" />
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="mb-1 text-[12px] text-muted">Valeur (ou cible)</dt>
          <dd>
            <CopyValue value={record.value} label="la valeur" />
          </dd>
        </div>
      </dl>
    </li>
  );
}

function ProviderGuide({ domain, zone }: { domain: SchoolDomain<TimestampLike>; zone: string }) {
  const guide = domain.dnsProvider ? DNS_PROVIDERS[domain.dnsProvider] : null;
  if (!guide) {
    return (
      <p className="rounded-md bg-surface px-3 py-2.5 text-[13px]">
        Connecte-toi là où tu as acheté <strong>{zone}</strong> (OVH, IONOS, Gandi, Cloudflare…) et
        ouvre la gestion de sa <strong>zone DNS</strong>.
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-md bg-surface px-3 py-2.5 text-[13px]">
      <p>
        <strong>{zone}</strong> est géré chez <strong>{guide.name}</strong>. Ouvre sa zone DNS :
      </p>
      <p className="text-muted">{guide.path}</p>
      {guide.tip ? (
        <p className="flex gap-1.5 text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {guide.tip}
        </p>
      ) : null}
      {guide.url ? (
        <Button asChild size="sm" variant="secondary">
          <a href={guide.url} target="_blank" rel="noopener noreferrer">
            Ouvrir {guide.name} <ExternalLink />
          </a>
        </Button>
      ) : null}
    </div>
  );
}

type StepState = "done" | "current" | "todo";

function Step({
  index,
  state,
  title,
  last,
  children,
}: {
  index: number;
  state: StepState;
  title: ReactNode;
  last?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="relative flex gap-3" aria-current={state === "current" ? "step" : undefined}>
      {!last ? (
        <span className="absolute left-3 top-7 -ml-px h-[calc(100%-1.75rem)] w-px bg-line" />
      ) : null}
      <span
        className={cn(
          "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
          state === "done" && "bg-success text-white",
          state === "current" && "bg-ink text-white",
          state === "todo" && "border border-line bg-white text-muted",
        )}
      >
        {state === "done" ? <Check className="size-3.5" /> : index}
      </span>
      <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-6")}>
        <p className={cn("text-sm font-medium leading-6", state === "todo" && "text-muted")}>
          {title}
        </p>
        {children ? <div className="mt-2 space-y-3">{children}</div> : null}
      </div>
    </li>
  );
}

type CheckState = "done" | "progress" | "waiting" | "problem";

function CheckItem({ state, label, detail }: { state: CheckState; label: string; detail: string }) {
  return (
    <li className="flex gap-2.5">
      {state === "done" ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : state === "progress" ? (
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-info" />
      ) : state === "problem" ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-line" />
      )}
      <div className="text-[13px]">
        <p className="font-medium">{label}</p>
        <p className="text-muted">{detail}</p>
      </div>
    </li>
  );
}

function hostCheck(domain: SchoolDomain<TimestampLike>, phase: DomainPhase): [CheckState, string] {
  switch (domain.hostState) {
    case "HOST_ACTIVE":
      return ["done", "Ton adresse mène bien à ton école."];
    case "HOST_CONFLICT":
      return ["problem", "Ton adresse pointe aussi ailleurs : supprime les anciens A / AAAA."];
    case "HOST_WRONG_SHARD":
      return [
        "problem",
        "L'adresse IP ne correspond plus : recopie la valeur de l'enregistrement A.",
      ];
    case "HOST_UNREACHABLE":
      return [
        "problem",
        "Le DNS de ton domaine ne répond pas : vérifie la zone chez ton hébergeur.",
      ];
    default:
      return phase === "dns"
        ? ["waiting", "En attente de l'enregistrement A."]
        : ["progress", "Google vérifie ton DNS (quelques minutes)."];
  }
}

function ownershipCheck(
  domain: SchoolDomain<TimestampLike>,
  phase: DomainPhase,
): [CheckState, string] {
  switch (domain.ownershipState) {
    case "OWNERSHIP_ACTIVE":
      return ["done", "Le domaine est bien relié à ton école."];
    case "OWNERSHIP_PENDING":
      return ["progress", "Enregistrement TXT trouvé : confirmation par Google (jusqu'à 24 h)."];
    case "OWNERSHIP_MISMATCH":
    case "OWNERSHIP_CONFLICT":
      return ["problem", "Un autre TXT « fah-claim » existe sur ce nom : supprime-le."];
    case "OWNERSHIP_UNREACHABLE":
      return [
        "problem",
        "Le DNS de ton domaine ne répond pas : vérifie la zone chez ton hébergeur.",
      ];
    default:
      return phase === "dns"
        ? ["waiting", "En attente de l'enregistrement TXT."]
        : ["progress", "Google vérifie l'enregistrement TXT."];
  }
}

function certCheck(domain: SchoolDomain<TimestampLike>): [CheckState, string] {
  switch (domain.certState) {
    case "CERT_ACTIVE":
    case "CERT_EXPIRING_SOON":
      return ["done", "Connexion sécurisée (https) active."];
    case "CERT_PROPAGATING":
      return ["progress", "Certificat créé, mise en service en cours."];
    case "CERT_EXPIRED":
      return [
        "problem",
        "Certificat expiré : vérifie que les enregistrements sont toujours en place.",
      ];
    default:
      return domain.hostState === "HOST_ACTIVE"
        ? ["progress", "Création du certificat HTTPS (souvent moins d'une heure)."]
        : ["waiting", "Créé automatiquement une fois l'adresse vérifiée."];
  }
}

const AUTO_REFRESH = {
  preparing: { every: 5_000, max: 12 },
  pending: { every: 60_000, max: 30 },
};

/** Vérification automatique tant que la page est ouverte (en plus de celle toutes les 10 min). */
function useAutoRefresh(host: string | undefined, phase: DomainPhase | null, paused: boolean) {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    if (!host || !phase || phase === "active") return;
    const { every, max } = phase === "preparing" ? AUTO_REFRESH.preparing : AUTO_REFRESH.pending;
    let count = 0;
    const timer = setInterval(() => {
      if (count >= max || pausedRef.current || document.visibilityState !== "visible") return;
      count += 1;
      callRefreshSchoolDomain().catch(() => undefined);
    }, every);
    return () => clearInterval(timer);
  }, [host, phase]);
}

function refreshMessage(result: SchoolDomain) {
  const phase = domainPhase(result);
  if (phase === "active") return { ok: true, text: `${result.host} est en ligne` };
  if (phase === "preparing") {
    return { ok: false, text: "Enregistrements en préparation : réessaie dans quelques secondes." };
  }
  if (phase === "dns") {
    const count = result.records.filter(recordNeedsAction).length;
    return {
      ok: false,
      text:
        count > 1
          ? `${count} enregistrements pas encore visibles dans le DNS. Après une modification, compte quelques minutes (parfois plus selon l'hébergeur).`
          : "1 enregistrement pas encore visible dans le DNS. Après une modification, compte quelques minutes (parfois plus selon l'hébergeur).",
    };
  }
  return {
    ok: false,
    text: "DNS en place : vérification et certificat HTTPS en cours. Tu recevras un email dès que c'est prêt.",
  };
}

function DomainForm({ busy, onSubmit }: { busy: boolean; onSubmit: (host: string) => void }) {
  const [host, setHost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const parsed = host.trim() ? schoolDomainInput.safeParse({ host }) : null;
  const valid = parsed?.success ? parsed.data.host : null;
  const apex = valid && valid === registrableDomain(valid) ? valid : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!parsed?.success) {
      setError(parsed?.error.issues[0]?.message ?? "Saisis une adresse");
      return;
    }
    onSubmit(parsed.data.host);
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="school-domain" className="block text-[13px] font-medium">
          Adresse de ton école
        </label>
        <div
          className={cn(
            "flex h-9 overflow-hidden rounded-md border bg-white focus-within:border-ink/40 focus-within:ring-2 focus-within:ring-brand-logo/25",
            error ? "border-danger" : "border-line",
          )}
        >
          <span className="flex select-none items-center border-r border-line bg-surface px-2.5 text-sm text-muted">
            https://
          </span>
          <input
            id="school-domain"
            value={host}
            onChange={(event) => {
              setHost(event.target.value);
              setError(null);
            }}
            placeholder="formation.ecolemotion.com"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            className="min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted/70"
          />
        </div>
        {error ? (
          <p className="text-[13px] text-danger">{error}</p>
        ) : valid && !apex ? (
          <p className="text-[13px] text-muted">
            Ton école sera accessible sur <strong className="text-ink">https://{valid}</strong>
          </p>
        ) : (
          <p className="text-[13px] text-muted">
            Un domaine que tu possèdes déjà, avec un sous-domaine de ton choix.
          </p>
        )}
      </div>

      {apex ? (
        <div className="space-y-2 rounded-md bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
          <p>
            <strong>{apex}</strong> est ton domaine principal : le site qui s&apos;y trouve
            aujourd&apos;hui serait remplacé par ton école. Un sous-domaine est plus simple et sans
            risque.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setHost(`formation.${apex}`);
              setError(null);
            }}
          >
            Utiliser formation.{apex}
          </Button>
        </div>
      ) : null}

      <Button type="submit" disabled={busy || !host.trim()}>
        {busy ? <Loader2 className="animate-spin" /> : null}
        {busy ? "Connexion du domaine…" : "Connecter le domaine"}
      </Button>
    </form>
  );
}

function HowItWorks() {
  const steps = [
    ["Choisis l'adresse", "Par exemple formation.tondomaine.com."],
    ["Ajoute 2 ou 3 enregistrements", "Chez ton hébergeur de domaine, en 5 minutes. On te guide."],
    ["C'est en ligne", "Vérification et HTTPS automatiques, email dès que c'est prêt."],
  ];
  return (
    <ol className="grid gap-3 border-t border-line-soft pt-4 sm:grid-cols-3">
      {steps.map(([title, text], index) => (
        <li key={title} className="flex gap-2.5 text-[13px]">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface text-[11px] font-semibold text-muted">
            {index + 1}
          </span>
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-muted">{text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function PhaseBadge({ phase }: { phase: DomainPhase }) {
  if (phase === "active") return <Badge tone="success">Actif</Badge>;
  if (phase === "verifying" || phase === "certificate") {
    return <Badge tone="info">Vérification en cours</Badge>;
  }
  return <Badge tone="warning">Action requise</Badge>;
}

/** Domaine personnalisé de l'école (ex. formation.ecolemotion.com). */
export function DomainSettingsCard() {
  const { schoolId } = useSchool();
  const { data: creator } = useCreator(schoolId);
  const domain = creator?.customDomain ?? null;
  const phase = domain ? domainPhase(domain) : null;
  const [busy, setBusy] = useState<"add" | "refresh" | "remove" | null>(null);
  useAutoRefresh(domain?.host, phase, busy !== null);

  async function add(host: string) {
    setBusy("add");
    try {
      const result = await callAddSchoolDomain({ host });
      toast.success(
        result.status === "active"
          ? `${result.host} est en ligne`
          : "Domaine enregistré : ajoute maintenant les enregistrements DNS",
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
      const message = refreshMessage(await callRefreshSchoolDomain());
      if (message.ok) toast.success(message.text);
      else toast.info(message.text, { duration: 8_000 });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(question: string) {
    if (!domain || !window.confirm(question)) return;
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

  const removeQuestion = domain
    ? `Retirer ${domain.host} ? Ton école reste accessible sur l'adresse de la plateforme.`
    : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Domaine personnalisé</CardTitle>
        {phase ? <PhaseBadge phase={phase} /> : null}
      </CardHeader>
      <CardBody className="space-y-4">
        {!domain || !phase ? (
          <>
            <p className="text-[13px] text-muted">
              Affiche ton école sur ta propre adresse : page d&apos;accueil, pages de vente et
              espace élève. Le certificat HTTPS est inclus.
            </p>
            <DomainForm busy={busy === "add"} onSubmit={add} />
            <HowItWorks />
          </>
        ) : phase === "active" ? (
          <ActiveDomain
            domain={domain}
            busy={busy !== null}
            onRemove={() => remove(removeQuestion)}
          />
        ) : (
          <PendingDomain
            domain={domain}
            phase={phase}
            busy={busy}
            onRefresh={refresh}
            onChange={() =>
              remove(
                `Changer d'adresse ? ${domain.host} sera retiré, puis tu pourras en saisir une autre.`,
              )
            }
            onRemove={() => remove(removeQuestion)}
          />
        )}
      </CardBody>
    </Card>
  );
}

function ActiveDomain({
  domain,
  busy,
  onRemove,
}: {
  domain: SchoolDomain<TimestampLike>;
  busy: boolean;
  onRemove: () => void;
}) {
  const url = `https://${domain.host}`;
  return (
    <>
      <div className="flex gap-2.5 rounded-md bg-success-soft px-3 py-2.5 text-[13px] text-success">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <p>
          Ton école est en ligne sur{" "}
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
            {domain.host}
          </a>
          , en HTTPS. L&apos;adresse de la plateforme continue aussi de fonctionner.
        </p>
      </div>
      <p className="text-[13px] text-muted">
        Si tes vidéos Vimeo sont limitées à certains sites, ajoute <strong>{domain.host}</strong>{" "}
        dans leurs réglages d&apos;intégration (Vimeo › Confidentialité › Intégration).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Ouvrir mon école <ExternalLink />
          </a>
        </Button>
        <Button variant="subtle" onClick={onRemove} disabled={busy} className="sm:ml-auto">
          Retirer le domaine
        </Button>
      </div>
    </>
  );
}

function PendingDomain({
  domain,
  phase,
  busy,
  onRefresh,
  onChange,
  onRemove,
}: {
  domain: SchoolDomain<TimestampLike>;
  phase: DomainPhase;
  busy: "add" | "refresh" | "remove" | null;
  onRefresh: () => void;
  onChange: () => void;
  onRemove: () => void;
}) {
  const zone = registrableDomain(domain.host);
  const provider = domain.dnsProvider ? DNS_PROVIDERS[domain.dnsProvider].name : null;
  const dnsStep = phase === "preparing" || phase === "dns";
  const todo = domain.records.filter(recordNeedsAction).length;
  const checks = [
    { label: "Adresse dirigée vers ton école", check: hostCheck(domain, phase) },
    { label: "Propriété du domaine confirmée", check: ownershipCheck(domain, phase) },
    { label: "Certificat HTTPS", check: certCheck(domain) },
  ];

  const records = (
    <>
      <ul className="space-y-2">
        {domain.records.map((record) => (
          <RecordItem
            key={`${record.action}-${record.type}-${record.name}-${record.value}`}
            record={record}
            zone={zone}
          />
        ))}
      </ul>
      <ul className="list-disc space-y-1 pl-5 text-[12px] text-muted">
        <li>
          Nom : saisis seulement la partie avant <strong>{zone}</strong>
          {relativeRecordName(domain.host, zone) === "@"
            ? " (« @ » ou vide pour le domaine principal)"
            : ""}
          . Si ton hébergeur demande le nom complet, ajoute .{zone} à la fin.
        </li>
        <li>TTL : laisse la valeur proposée par défaut.</li>
        <li>
          Un ancien enregistrement A, AAAA ou CNAME existe déjà sur ce nom ? Supprime-le, sinon
          l&apos;adresse ne peut pas être vérifiée.
        </li>
      </ul>
    </>
  );

  return (
    <>
      <ol>
        <Step index={1} state="done" title="Adresse choisie">
          <p className="flex flex-wrap items-center gap-x-2 text-[13px]">
            <span className="font-mono">{domain.host}</span>
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0"
              onClick={onChange}
              disabled={busy !== null}
            >
              Changer
            </Button>
          </p>
        </Step>

        <Step
          index={2}
          state={dnsStep ? "current" : "done"}
          title={
            dnsStep
              ? `Configure le DNS chez ${provider ?? "ton hébergeur de domaine"}`
              : "Enregistrements DNS en place"
          }
        >
          {phase === "preparing" ? (
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <Loader2 className="size-4 animate-spin" />
              Préparation des enregistrements à créer (quelques secondes)…
            </p>
          ) : dnsStep ? (
            <>
              <p className="text-[13px] text-muted">
                {todo > 1 ? `${todo} modifications à faire` : "1 modification à faire"}, environ 5
                minutes. Chaque enregistrement passe à « Détecté » dès qu&apos;il est visible.
              </p>
              <ProviderGuide domain={domain} zone={zone} />
              {records}
            </>
          ) : (
            <details className="text-[13px]">
              <summary className="cursor-pointer text-muted hover:text-ink">
                Voir les enregistrements
              </summary>
              <div className="mt-2 space-y-3">{records}</div>
            </details>
          )}
        </Step>

        <Step
          index={3}
          state={dnsStep ? "todo" : "current"}
          title="Vérification et certificat HTTPS"
          last
        >
          {!dnsStep ? (
            <>
              <ul className="space-y-2.5">
                {checks.map(({ label, check: [state, detail] }) => (
                  <CheckItem key={label} state={state} label={label} detail={detail} />
                ))}
              </ul>
              <p className="rounded-md bg-info-soft px-3 py-2.5 text-[13px] text-info">
                Tout est automatique : tu peux fermer cette page. Tu recevras un email dès que ton
                école sera en ligne (souvent en moins d&apos;une heure, jusqu&apos;à 24 h).
              </p>
            </>
          ) : (
            <p className="text-[13px] text-muted">
              Automatique une fois le DNS configuré : on vérifie toutes les 10 minutes et on te
              prévient par email.
            </p>
          )}
        </Step>
      </ol>

      {domain.issues?.length || domain.hostState ? (
        <details className="text-[12px] text-muted">
          <summary className="cursor-pointer hover:text-ink">Détails techniques</summary>
          <div className="mt-2 space-y-1 font-mono">
            <p>
              {domain.hostState ?? "—"} · {domain.ownershipState ?? "—"} · {domain.certState ?? "—"}
            </p>
            {domain.issues?.map((issue) => (
              <p key={issue} className="break-words">
                {issue}
              </p>
            ))}
          </div>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
        <Button variant="secondary" onClick={onRefresh} disabled={busy !== null}>
          <RefreshCw className={busy === "refresh" ? "animate-spin" : undefined} />
          {busy === "refresh" ? "Vérification…" : "Vérifier maintenant"}
        </Button>
        <span className="text-[12px] text-muted">Vérifié {formatRelative(domain.checkedAt)}</span>
        <Button variant="subtle" onClick={onRemove} disabled={busy !== null} className="ml-auto">
          Retirer le domaine
        </Button>
      </div>
    </>
  );
}
