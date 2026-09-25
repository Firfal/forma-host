"use client";

import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { routes } from "@shared/paths";
import { useNextPath } from "@/components/auth/use-next-path";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/firebase/callables";
import { auth } from "@/lib/firebase/client";

export function SignupForm() {
  const router = useRouter();
  const next = useNextPath();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setEmailTaken(false);
    if (password.length < 8) {
      setError("Mot de passe trop court (8 caractères minimum).");
      return;
    }
    setSubmitting(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(credential.user, { displayName: name.trim() });
      // Recharge le token pour que le profil soit créé avec le bon nom.
      await credential.user.getIdToken(true);
      router.replace(next ?? routes.myCourses);
    } catch (err) {
      // Compte pré-créé par une invitation : il faut définir un mot de passe.
      if ((err as { code?: string }).code === "auth/email-already-in-use") setEmailTaken(true);
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-[15px] font-semibold">Créer un compte</h1>
        <p className="mt-1 text-[13px] text-muted">Pour suivre tes formations et en héberger.</p>
      </div>
      <Field label="Prénom et nom" htmlFor="name">
        <Input
          id="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
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
          {error}{" "}
          {emailTaken ? (
            <>
              Si tu as été invité à une formation,{" "}
              <Link href={routes.resetPassword} className="underline underline-offset-2">
                définis ton mot de passe ici
              </Link>
              .
            </>
          ) : null}
        </p>
      ) : null}
      <Button
        type="submit"
        className="w-full"
        disabled={submitting || !name || !email || !password}
      >
        {submitting ? "Création…" : "Créer mon compte"}
      </Button>
      <p className="text-center text-[13px] text-muted">
        Déjà un compte ?{" "}
        <Link href={routes.login} className="underline underline-offset-2">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
