"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, Send } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  MAIL_PROVIDERS,
  mailSettingsInput,
  SMTP_PORTS,
  type MailProvider,
} from "@shared/mail-settings";
import type { MailSettingsDoc } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useCreator } from "@/lib/creator";
import {
  callDeleteMailSettings,
  callSaveMailSettings,
  callSendTestMail,
  errorMessage,
} from "@/lib/firebase/callables";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useMailSettings } from "@/lib/mail-settings";

interface MailForm {
  provider: MailProvider;
  host: string;
  port: number;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

type Errors = Partial<Record<keyof MailForm, string>>;

function initialForm(
  settings: MailSettingsDoc | null,
  defaults: { fromName: string; fromEmail: string },
): MailForm {
  if (settings) {
    return {
      provider: settings.provider,
      host: settings.host,
      port: settings.port,
      username: settings.username,
      password: "",
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
    };
  }
  return {
    provider: "brevo",
    host: "",
    port: 587,
    username: "",
    password: "",
    ...defaults,
  };
}

function resendSummary({ sent, failed }: { sent: number; failed: number }) {
  return {
    sent: sent === 1 ? "1 email en attente envoyé" : `${sent} emails en attente envoyés`,
    failed:
      failed === 1
        ? "1 email en attente n'a pas pu partir."
        : `${failed} emails en attente n'ont pas pu partir.`,
  };
}

function MailStatus({ settings }: { settings: MailSettingsDoc | null }) {
  if (!settings) {
    return (
      <div className="flex gap-2.5 rounded-md bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          L&apos;envoi n&apos;est pas encore configuré. Les emails de bienvenue et les notifications
          sont mis en attente : ils partiront dès que tu auras enregistré tes réglages.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2.5 rounded-md bg-success-soft px-3 py-2.5 text-[13px] text-success">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <p>
          Tes emails partent au nom de{" "}
          <strong>
            {settings.fromName} &lt;{settings.fromEmail}&gt;
          </strong>{" "}
          via {MAIL_PROVIDERS[settings.provider].label}.
          {settings.lastSentAt ? ` Dernier envoi ${formatRelative(settings.lastSentAt)}.` : ""}
        </p>
      </div>
      {settings.lastError ? (
        <div className="flex gap-2.5 rounded-md bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>Dernier échec</strong> ({formatDateTime(settings.lastErrorAt)}) :{" "}
            {settings.lastError}
            <span className="mt-1 block">
              Corrige tes réglages puis enregistre : les emails en échec seront renvoyés.
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Réglages SMTP du formateur : les emails de la plateforme partent depuis son adresse. */
export function MailSettingsCard() {
  const { user } = useAuth();
  const { data: settings, loading } = useMailSettings(user?.uid);
  const { data: creator, loading: creatorLoading } = useCreator(user?.uid);
  const [form, setForm] = useState<MailForm | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<"save" | "test" | "delete" | null>(null);

  useEffect(() => {
    if (form || loading || creatorLoading) return;
    setForm(
      initialForm(settings, {
        fromName: creator?.name ?? user?.displayName ?? "",
        fromEmail: creator?.supportEmail ?? user?.email ?? "",
      }),
    );
  }, [form, loading, creatorLoading, settings, creator, user]);

  if (!form) {
    return (
      <Card>
        <CardBody className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16" />
          <Skeleton className="h-40" />
        </CardBody>
      </Card>
    );
  }

  const preset = MAIL_PROVIDERS[form.provider];

  function update<K extends keyof MailForm>(key: K, value: MailForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const parsed = mailSettingsInput.safeParse({
      ...form,
      host: form.provider === "smtp" ? form.host : undefined,
      port: form.provider === "smtp" ? form.port : undefined,
      password: form.password || undefined,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof MailForm;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    if (!settings && !form.password) {
      setErrors({ password: `${preset.passwordLabel} requis` });
      return;
    }
    setBusy("save");
    try {
      const result = await callSaveMailSettings(parsed.data);
      update("password", "");
      const summary = resendSummary(result);
      toast.success(
        `Connexion vérifiée, réglages enregistrés${result.sent ? ` · ${summary.sent}` : ""}`,
      );
      if (result.failed) toast.warning(summary.failed);
    } catch (error) {
      toast.error(errorMessage(error), { duration: 10_000 });
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    try {
      const { email } = await callSendTestMail();
      toast.success(`Email de test envoyé à ${email}`);
    } catch (error) {
      toast.error(errorMessage(error), { duration: 10_000 });
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    if (
      !window.confirm("Désactiver l'envoi des emails ? Les prochains emails seront mis en attente.")
    )
      return;
    setBusy("delete");
    try {
      await callDeleteMailSettings();
      setForm((current) => (current ? { ...current, password: "" } : current));
      toast.success("Envoi des emails désactivé");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Envoi des emails</CardTitle>
        {settings ? (
          <Badge tone="success">Actif</Badge>
        ) : (
          <Badge tone="warning">Non configuré</Badge>
        )}
      </CardHeader>
      <CardBody className="space-y-5">
        <p className="text-[13px] text-muted">
          Emails de bienvenue, liens d&apos;activation et notifications partent depuis ton adresse,
          via ton fournisseur d&apos;email. Tes élèves les reçoivent de ta part.
        </p>
        <MailStatus settings={settings} />

        <form onSubmit={save} className="space-y-4" noValidate>
          <div>
            <p className="mb-1.5 text-[13px] font-medium">Fournisseur</p>
            <div
              className="inline-flex rounded-md border border-line p-0.5 text-[13px]"
              role="tablist"
            >
              {(Object.keys(MAIL_PROVIDERS) as MailProvider[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={form.provider === id}
                  onClick={() => update("provider", id)}
                  className={cn(
                    "rounded px-3 py-1 font-medium text-muted",
                    form.provider === id && "bg-surface text-ink",
                  )}
                >
                  {MAIL_PROVIDERS[id].label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-muted">
              {preset.help}{" "}
              {preset.helpUrl ? (
                <a
                  href={preset.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-ink underline decoration-line underline-offset-2"
                >
                  {preset.helpLinkLabel} <ExternalLink className="size-3" />
                </a>
              ) : null}
            </p>
          </div>

          {form.provider === "smtp" ? (
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <Field label="Serveur SMTP" htmlFor="mail-host" error={errors.host}>
                <Input
                  id="mail-host"
                  value={form.host}
                  onChange={(e) => update("host", e.target.value)}
                  placeholder="ssl0.ovh.net"
                  autoComplete="off"
                />
              </Field>
              <Field label="Port" htmlFor="mail-port" error={errors.port}>
                <select
                  id="mail-port"
                  value={form.port}
                  onChange={(e) => update("port", Number(e.target.value))}
                  className="h-9 w-full rounded-md border border-line bg-white px-2 text-sm"
                >
                  {SMTP_PORTS.map((port) => (
                    <option key={port} value={port}>
                      {port}
                      {port === 465 ? " (SSL)" : port === 587 ? " (TLS)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={preset.usernameLabel} htmlFor="mail-username" error={errors.username}>
              <Input
                id="mail-username"
                value={form.username}
                onChange={(e) => update("username", e.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field
              label={preset.passwordLabel}
              htmlFor="mail-password"
              error={errors.password}
              hint={settings ? "Enregistré. Laisse vide pour le conserver." : undefined}
            >
              <Input
                id="mail-password"
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder={settings ? "••••••••" : ""}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Nom de l'expéditeur" htmlFor="mail-from-name" error={errors.fromName}>
              <Input
                id="mail-from-name"
                value={form.fromName}
                onChange={(e) => update("fromName", e.target.value)}
                placeholder="Ecole Motion"
              />
            </Field>
            <Field
              label="Email de l'expéditeur"
              htmlFor="mail-from-email"
              error={errors.fromEmail}
              hint={
                form.provider === "gmail"
                  ? "Ton adresse Gmail (ou un alias configuré dans Gmail)."
                  : undefined
              }
            >
              <Input
                id="mail-from-email"
                type="email"
                value={form.fromEmail}
                onChange={(e) => update("fromEmail", e.target.value)}
                placeholder="contact@ecolemotion.com"
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" disabled={busy !== null}>
              {busy === "save" ? "Vérification…" : "Vérifier et enregistrer"}
            </Button>
            {settings ? (
              <>
                <Button variant="secondary" onClick={sendTest} disabled={busy !== null}>
                  <Send /> {busy === "test" ? "Envoi…" : "M'envoyer un test"}
                </Button>
                <Button
                  variant="subtle"
                  onClick={disable}
                  disabled={busy !== null}
                  className="sm:ml-auto"
                >
                  Désactiver
                </Button>
              </>
            ) : null}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
