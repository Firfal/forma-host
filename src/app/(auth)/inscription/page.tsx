import { Suspense } from "react";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Créer un compte" };

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
