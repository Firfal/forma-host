"use client";

import { updateProfile } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { ProfileDoc, UserDoc } from "@shared/types";
import { PageContainer } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { useDocData } from "@/lib/hooks";

export default function AccountPage() {
  const { user, isCreator } = useAuth();
  const profileRef = useMemo(() => (user ? doc(db, "profiles", user.uid) : null), [user]);
  const userRef = useMemo(() => (user ? doc(db, "users", user.uid) : null), [user]);
  const { data: profile } = useDocData<ProfileDoc>(profileRef);
  const { data: userDoc } = useDocData<UserDoc>(userRef);
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const displayName = name ?? profile?.displayName ?? "";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user || !profileRef || !displayName.trim()) return;
    setSaving(true);
    try {
      await Promise.all([
        updateDoc(profileRef, { displayName: displayName.trim() }),
        updateProfile(user, { displayName: displayName.trim() }),
      ]);
      toast.success("Profil enregistré");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function toggleCommentEmails(checked: boolean) {
    if (!userRef) return;
    try {
      await updateDoc(userRef, { notifyOnComment: checked });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <PageContainer width="narrow">
      <PageHeader title="Mon compte" />
      <div className="space-y-4">
        <Card>
          <CardBody>
            <form onSubmit={onSubmit} className="space-y-4">
              <Field
                label="Nom affiché"
                htmlFor="displayName"
                hint="Visible dans les commentaires."
              >
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input id="email" value={user?.email ?? ""} disabled />
              </Field>
              <Button type="submit" disabled={saving || !displayName.trim()}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </form>
          </CardBody>
        </Card>
        {isCreator ? (
          <Card>
            <CardBody className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Email à chaque nouveau commentaire</p>
                <p className="text-[13px] text-muted">
                  Les notifications restent visibles dans la cloche.
                </p>
              </div>
              <Switch
                checked={userDoc?.notifyOnComment ?? true}
                onCheckedChange={toggleCommentEmails}
                aria-label="Email à chaque nouveau commentaire"
              />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </PageContainer>
  );
}
