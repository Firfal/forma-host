"use client";

import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { isFreeVimeoAccount, vimeoAccountLabel, vimeoSettingsInput } from "@shared/vimeo-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { brand } from "@/lib/brand";
import {
  callDeleteVimeoSettings,
  callSaveVimeoSettings,
  errorMessage,
} from "@/lib/firebase/callables";
import { useVimeoSettings } from "@/lib/vimeo-settings";

const appHost = (() => {
  try {
    return new URL(brand.appUrl).host;
  } catch {
    return brand.appUrl;
  }
})();

/** Compte Vimeo de l'école : durée et miniature des vidéos, y compris masquées ou privées. */
export function VimeoSettingsCard() {
  const { user } = useAuth();
  const { data: settings, loading } = useVimeoSettings(user?.uid);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = vimeoSettingsInput.safeParse({ token });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Token invalide");
      return;
    }
    setBusy("save");
    try {
      const account = await callSaveVimeoSettings(parsed.data);
      setToken("");
      toast.success(`Compte Vimeo relié${account.name ? ` : ${account.name}` : ""}`);
    } catch (err) {
      toast.error(errorMessage(err), { duration: 10_000 });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm("Retirer le compte Vimeo ?")) return;
    setBusy("delete");
    try {
      await callDeleteVimeoSettings();
      toast.success("Compte Vimeo retiré");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const free = settings ? isFreeVimeoAccount(settings.account) : false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vimeo</CardTitle>
        {loading ? null : settings ? (
          <Badge tone="success">Relié</Badge>
        ) : (
          <Badge tone="neutral">Non relié</Badge>
        )}
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-[13px] text-muted">
          Avec ton token Vimeo, la durée et la miniature de chaque vidéo sont récupérées
          automatiquement, même pour les vidéos masquées ou privées. Facultatif.
        </p>

        {settings ? (
          <div className="flex gap-2.5 rounded-md bg-success-soft px-3 py-2.5 text-[13px] text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <p>
              Compte <strong>{settings.accountName ?? "Vimeo"}</strong>, offre{" "}
              {vimeoAccountLabel(settings.account)}.
            </p>
          </div>
        ) : null}
        {free ? (
          <div className="flex gap-2.5 rounded-md bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Avec l&apos;offre gratuite, tes vidéos sont publiques sur Vimeo : n&apos;importe qui
              avec le lien peut les voir. Une offre payante (Starter ou plus) permet de les masquer
              et de limiter leur lecture à ton site.
            </p>
          </div>
        ) : null}
        <p className="text-[13px] text-muted">
          Dans les réglages de chaque vidéo (Confidentialité &gt; Intégration), autorise le domaine{" "}
          <code className="rounded bg-surface px-1 py-0.5 text-ink">{appHost}</code>.
        </p>

        <form onSubmit={save} className="space-y-3" noValidate>
          <Field
            label="Token d'accès Vimeo"
            htmlFor="vimeo-token"
            error={error}
            hint={
              <>
                Sur developer.vimeo.com : Create app, puis Generate an access token avec les accès «
                Public » et « Private ».{" "}
                <a
                  href="https://developer.vimeo.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-ink underline decoration-line underline-offset-2"
                >
                  Ouvrir Vimeo <ExternalLink className="size-3" />
                </a>
              </>
            }
          >
            <Input
              id="vimeo-token"
              type="password"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setError(null);
              }}
              placeholder={
                settings ? "•••••••• (relié — colle un nouveau token pour le changer)" : ""
              }
              autoComplete="off"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy !== null || !token.trim()}>
              {busy === "save" ? "Vérification…" : "Relier le compte"}
            </Button>
            {settings ? (
              <Button
                variant="subtle"
                onClick={remove}
                disabled={busy !== null}
                className="sm:ml-auto"
              >
                Retirer
              </Button>
            ) : null}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
