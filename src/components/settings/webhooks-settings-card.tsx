"use client";

import { collection, orderBy, query } from "firebase/firestore";
import { Copy, Plug, Send, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  MAX_WEBHOOKS,
  SIGNATURE_HEADER,
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_IDS,
  webhookInput,
  type WebhookDoc,
  type WebhookEvent,
} from "@shared/webhooks";
import type { TimestampLike } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  callDeleteWebhook,
  callSaveWebhook,
  callTestWebhook,
  errorMessage,
} from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { formatRelative } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import { useSchool } from "@/lib/school";

type Webhook = WebhookDoc<TimestampLike> & { id: string };

function DeliveryStatus({ hook }: { hook: Webhook }) {
  if (hook.lastStatus === null) return <Badge>Jamais utilisé</Badge>;
  const ok = hook.lastStatus >= 200 && hook.lastStatus < 300;
  return (
    <Badge tone={ok ? "success" : "danger"}>
      {ok ? "OK" : hook.lastStatus ? `Erreur ${hook.lastStatus}` : "Sans réponse"} ·{" "}
      {formatRelative(hook.lastDeliveryAt)}
    </Badge>
  );
}

function WebhookRow({ schoolId, hook }: { schoolId: string; hook: Webhook }) {
  const [busy, setBusy] = useState(false);
  async function test() {
    setBusy(true);
    try {
      const { status } = await callTestWebhook({ schoolId, webhookId: hook.id });
      if (status >= 200 && status < 300) toast.success(`Test reçu (${status})`);
      else toast.error(status ? `L'outil a répondu ${status}` : "Aucune réponse de l'adresse");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px]" title={hook.url}>
          {hook.url}
        </span>
        <DeliveryStatus hook={hook} />
      </div>
      <div className="flex flex-wrap gap-1">
        {hook.events.map((event) => (
          <Badge key={event} tone="neutral">
            {WEBHOOK_EVENTS[event]}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(hook.secret);
            toast.success("Clé de signature copiée");
          }}
        >
          <Copy /> Copier la clé de signature
        </Button>
        <span className="flex-1" />
        <Button variant="secondary" size="sm" onClick={test} disabled={busy}>
          <Send /> {busy ? "Envoi…" : "Tester"}
        </Button>
        <Button
          variant="subtle"
          size="icon"
          aria-label={`Supprimer le webhook ${hook.url}`}
          onClick={() => {
            if (!window.confirm("Supprimer ce webhook ?")) return;
            callDeleteWebhook({ schoolId, webhookId: hook.id }).catch((error) =>
              toast.error(errorMessage(error)),
            );
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

/** Intégrations : webhooks vers Zapier, Make, n8n… (rien n'est envoyé sans webhook). */
export function WebhooksSettingsCard() {
  const { schoolId } = useSchool();
  const hooksQuery = useMemo(
    () =>
      schoolId
        ? query(collection(db, "creators", schoolId, "webhooks"), orderBy("createdAt", "asc"))
        : null,
    [schoolId],
  );
  const { data: hooks } = useQueryData<WebhookDoc<TimestampLike>>(hooksQuery);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(["student.enrolled", "order.paid"]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!schoolId) return;
    const parsed = webhookInput.safeParse({ schoolId, url, events });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Webhook invalide");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await callSaveWebhook(parsed.data);
      setUrl("");
      toast.success("Webhook ajouté : clique sur « Tester » pour l'essayer");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-muted">
          <Plug /> Intégrations (Zapier, Make…)
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-[13px] text-muted">
          À chaque événement choisi, Forma Host envoie ses données (JSON) à l&apos;adresse de ton
          outil : ajouter l&apos;élève à ta liste email, prévenir ton équipe sur Slack, remplir un
          tableur… Chaque envoi est signé (en-tête {SIGNATURE_HEADER}, HMAC SHA-256).
        </p>
        {hooks.length ? (
          <ul className="divide-y divide-line-soft rounded-md border border-line">
            {(hooks as Webhook[]).map((hook) => (
              <WebhookRow key={hook.id} schoolId={schoolId!} hook={hook} />
            ))}
          </ul>
        ) : null}
        {hooks.length < MAX_WEBHOOKS ? (
          <form className="space-y-3" onSubmit={add}>
            <Field
              label="Adresse du webhook"
              htmlFor="webhook-url"
              error={error ?? undefined}
              hint="Zapier : déclencheur « Webhooks by Zapier > Catch Hook ». Make : module « Custom webhook »."
            >
              <Input
                id="webhook-url"
                type="url"
                placeholder="https://hooks.zapier.com/hooks/catch/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium">Événements</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {WEBHOOK_EVENT_IDS.map((id) => (
                  <label key={id} className="flex items-center gap-2 text-[14px]">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-ink)]"
                      checked={events.includes(id)}
                      onChange={(e) =>
                        setEvents((current) =>
                          e.target.checked ? [...current, id] : current.filter((x) => x !== id),
                        )
                      }
                    />
                    {WEBHOOK_EVENTS[id]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={busy || !url.trim()}>
                {busy ? "Ajout…" : "Ajouter le webhook"}
              </Button>
            </div>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}
