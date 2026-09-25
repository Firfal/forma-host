"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { routes } from "@shared/paths";
import { homeFor, useNextPath } from "@/components/auth/use-next-path";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { errorMessage } from "@/lib/firebase/callables";
import { auth } from "@/lib/firebase/client";

export function LoginForm() {
  const router = useRouter();
  const next = useNextPath();
  const { user, loading, isCreator } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(next ?? homeFor(isCreator));
  }, [loading, user, isCreator, next, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-[15px] font-semibold">Connexion à {brand.name}</h1>
        <p className="mt-1 text-[13px] text-muted">
          Mot de passe oublié ?{" "}
          <Link href={routes.resetPassword} className="underline underline-offset-2">
            Le réinitialiser
          </Link>
          .
        </p>
      </div>
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="prenom@exemple.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </Field>
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={submitting || !email || !password}>
        {submitting ? "Connexion…" : "Se connecter"}
      </Button>
      <p className="text-center text-[13px] text-muted">
        <Link href={routes.signup} className="underline underline-offset-2">
          Créer un compte
        </Link>{" "}
        si tu n&apos;en as pas encore.
      </p>
    </form>
  );
}
