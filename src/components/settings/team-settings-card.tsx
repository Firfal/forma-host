"use client";

import { collection } from "firebase/firestore";
import { UserPlus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { paths } from "@shared/paths";
import { inviteSchoolAdminInput } from "@shared/school";
import type { SchoolMemberDoc } from "@shared/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  callInviteSchoolAdmin,
  callRemoveSchoolAdmin,
  errorMessage,
} from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { useQueryData } from "@/lib/hooks";
import { useMailSettings } from "@/lib/mail-settings";
import { useSchool } from "@/lib/school";

/** Équipe de l'école : le propriétaire invite ou retire des co-administrateurs. */
export function TeamSettingsCard() {
  const { schoolId } = useSchool();
  const membersQuery = useMemo(
    () => (schoolId ? collection(db, paths.creatorMembers(schoolId)) : null),
    [schoolId],
  );
  const { data: members } = useQueryData<SchoolMemberDoc>(membersQuery);
  const { data: mailSettings, loading: mailLoading } = useMailSettings(schoolId);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const sorted = [...members].sort((a, b) =>
    a.role === b.role ? a.email.localeCompare(b.email) : a.role === "owner" ? -1 : 1,
  );

  async function invite(event: FormEvent) {
    event.preventDefault();
    const parsed = inviteSchoolAdminInput.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Email invalide");
      return;
    }
    setBusy("invite");
    try {
      const result = await callInviteSchoolAdmin(parsed.data);
      setEmail("");
      toast.success(
        result.activation
          ? `Invitation envoyée à ${parsed.data.email} : il ou elle active son compte depuis l'email.`
          : `${parsed.data.email} fait maintenant partie de l'équipe.`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(member: SchoolMemberDoc & { id: string }) {
    if (!window.confirm(`Retirer ${member.email} de l'équipe ?`)) return;
    setBusy(member.id);
    try {
      await callRemoveSchoolAdmin({ uid: member.id });
      toast.success(`${member.email} a été retiré de l'équipe`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Équipe</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-[13px] text-muted">
          Les administrateurs gèrent les formations, les élèves et les commentaires. L&apos;équipe,
          l&apos;envoi des emails et Vimeo restent réservés au propriétaire.
        </p>

        <ul className="divide-y divide-line-soft rounded-md border border-line">
          {sorted.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name={member.displayName || member.email} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{member.displayName || member.email}</p>
                {member.displayName ? (
                  <p className="truncate text-[12px] text-muted">{member.email}</p>
                ) : null}
              </div>
              {member.role === "owner" ? (
                <Badge tone="brand">Propriétaire</Badge>
              ) : (
                <>
                  <Badge tone="neutral">Administrateur</Badge>
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => remove(member)}
                    disabled={busy !== null}
                  >
                    Retirer
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={invite} className="flex items-end gap-2" noValidate>
          <Field
            label="Inviter un administrateur"
            htmlFor="team-email"
            error={error}
            className="flex-1"
          >
            <Input
              id="team-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="prenom@exemple.fr"
            />
          </Field>
          <Button type="submit" disabled={busy !== null || !email.trim()}>
            <UserPlus /> Inviter
          </Button>
        </form>
        {!mailLoading && !mailSettings ? (
          <p className="text-[13px] text-warning">
            L&apos;email d&apos;invitation partira dès que l&apos;envoi des emails sera configuré.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
