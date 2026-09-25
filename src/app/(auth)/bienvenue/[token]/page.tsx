"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { routes } from "@shared/paths";
import type { InviteInfo } from "@shared/schemas";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { callAcceptInvite, callGetInvite, errorMessage } from "@/lib/firebase/callables";
import { auth } from "@/lib/firebase/client";

export default function WelcomePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<{ code: string; message: string } | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    callGetInvite({ token })
      .then(setInvite)
      .catch((err) =>
        setLoadError({ code: (err as { code?: string }).code ?? "", message: errorMessage(err) }),
      );
  }, [token]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!invite) return;
    if (password.length < 8) {
      setError("8 caractères minimum.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { email } = await callAcceptInvite({ token, password, displayName: name.trim() });
      await signInWithEmailAndPassword(auth, email, password);
      router.replace(routes.myCourses);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  if (loadError) {
    const alreadyActivated = loadError.code === "functions/already-exists";
    return (
      <div className="space-y-3">
        <h1 className="text-[15px] font-semibold">
          {alreadyActivated ? "Compte déjà activé" : "Lien d'invitation invalide"}
        </h1>
        <p className="text-[13px] text-muted">{loadError.message}</p>
        <div className="flex gap-2">
          <Button asChild className="flex-1">
            <Link href={routes.login}>Se connecter</Link>
          </Button>
          {!alreadyActivated ? (
            <Button asChild variant="secondary" className="flex-1">
              <Link href={routes.resetPassword}>Mot de passe oublié</Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-[15px] font-semibold">Bienvenue !</h1>
        <p className="mt-1 text-[13px] text-muted">
          {invite.creatorName ? `${invite.creatorName} t'a donné accès à ` : "Tu as accès à "}
          <strong className="text-ink">« {invite.courseTitle} »</strong>. Choisis un mot de passe
          pour activer ton compte.
        </p>
      </div>
      <Field label="Email" htmlFor="email">
        <Input id="email" value={invite.email} disabled />
      </Field>
      <Field label="Prénom et nom" htmlFor="name" hint="Affiché dans les commentaires.">
        <Input
          id="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <Field label="Mot de passe" htmlFor="password" hint="8 caractères minimum.">
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={submitting || !name.trim() || !password}>
        {submitting ? "Activation…" : "Activer mon compte"}
      </Button>
    </form>
  );
}
