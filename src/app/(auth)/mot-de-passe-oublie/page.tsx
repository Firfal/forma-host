"use client";

import { sendPasswordResetEmail } from "firebase/auth";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { routes } from "@shared/paths";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/firebase/callables";
import { auth } from "@/lib/firebase/client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      auth.languageCode = "fr";
      await sendPasswordResetEmail(auth, email.trim(), {
        url: `${window.location.origin}${routes.login}`,
      });
      setSent(true);
    } catch (err) {
      // On ne révèle pas si le compte existe.
      if ((err as { code?: string }).code === "auth/user-not-found") setSent(true);
      else setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-3">
        <h1 className="text-[15px] font-semibold">Vérifie ta boîte mail</h1>
        <p className="text-[13px] text-muted">
          Si un compte existe pour <strong className="text-ink">{email}</strong>, tu vas recevoir un
          lien pour choisir un nouveau mot de passe.
        </p>
        <Button asChild variant="secondary" className="w-full">
          <Link href={routes.login}>Retour à la connexion</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-[15px] font-semibold">Mot de passe oublié</h1>
        <p className="mt-1 text-[13px] text-muted">
          On t&apos;envoie un lien pour en choisir un nouveau.
        </p>
      </div>
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={submitting || !email}>
        {submitting ? "Envoi…" : "Envoyer le lien"}
      </Button>
      <p className="text-center text-[13px] text-muted">
        <Link href={routes.login} className="underline underline-offset-2">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
