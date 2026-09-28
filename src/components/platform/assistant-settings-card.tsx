"use client";

import { doc } from "firebase/firestore";
import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ASSISTANT_DAILY_LIMIT,
  assistantKeyInput,
  type AssistantSettingsDoc,
} from "@shared/assistant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  callDeleteAssistantKey,
  callSaveAssistantKey,
  errorMessage,
} from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { useDocData } from "@/lib/hooks";

/** Clé API Anthropic de la plateforme : sans elle, l'assistant IA reste invisible partout. */
export function AssistantSettingsCard() {
  const ref = useMemo(() => doc(db, "platform", "assistant"), []);
  const { data: settings } = useDocData<AssistantSettingsDoc>(ref);
  const [apiKey, setApiKey] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const enabled = Boolean(settings?.enabled);

  async function save() {
    const parsed = assistantKeyInput.safeParse({ apiKey });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Clé invalide");
      return;
    }
    setBusy(true);
    try {
      await callSaveAssistantKey(parsed.data);
      setApiKey("");
      setEditing(false);
      toast.success("Assistant IA activé");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!window.confirm("Désactiver l'assistant IA sur toutes les formations ?")) return;
    setBusy(true);
    try {
      await callDeleteAssistantKey({});
      toast.success("Assistant IA désactivé");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-muted">
          <Sparkles /> Assistant IA
        </CardTitle>
        <Badge tone={enabled ? "success" : "neutral"}>{enabled ? "Activé" : "Désactivé"}</Badge>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-[13px] text-muted">
          Sous chaque leçon, les élèves posent leurs questions à un assistant (Claude) qui répond à
          partir du contenu de la formation. Les formateurs l&apos;activent formation par formation.{" "}
          {ASSISTANT_DAILY_LIMIT} questions par élève et par jour ; la consommation est facturée sur
          le compte Anthropic de la clé.
        </p>
        {enabled && !editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px]">
              Clé enregistrée : <span className="font-mono">sk-ant-…{settings?.keyLast4}</span>
            </span>
            <span className="flex-1" />
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={busy}>
              Remplacer la clé
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={disable}
              disabled={busy}
            >
              Désactiver
            </Button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field
              label="Clé API Anthropic"
              htmlFor="assistant-key"
              hint="console.anthropic.com > API Keys. Elle est vérifiée puis enregistrée chiffrée ; elle n'est plus jamais affichée."
            >
              <Input
                id="assistant-key"
                type="password"
                autoComplete="off"
                placeholder="sk-ant-…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              {editing ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Annuler
                </Button>
              ) : null}
              <Button type="submit" size="sm" disabled={busy || !apiKey.trim()}>
                {busy ? "Vérification…" : "Activer l'assistant"}
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
