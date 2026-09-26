"use client";

import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { routes } from "@shared/paths";
import type { EnrollmentDoc } from "@shared/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { callOpenConversation, errorMessage } from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { useQueryData } from "@/lib/hooks";
import { useSchool } from "@/lib/school";

/** Équipe : écrire à un élève de l'école (inscrit à au moins une formation). */
export function NewConversationDialog({ className }: { className?: string }) {
  const { schoolId } = useSchool();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const enrollmentsQuery = useMemo(
    () =>
      open && schoolId
        ? query(
            collection(db, "enrollments"),
            where("creatorId", "==", schoolId),
            orderBy("joinedAt", "desc"),
            limit(1000),
          )
        : null,
    [open, schoolId],
  );
  const { data: enrollments, loading } = useQueryData<EnrollmentDoc>(enrollmentsQuery);

  const students = useMemo(() => {
    const byUid = new Map<string, { uid: string; name: string; email: string }>();
    for (const enrollment of enrollments) {
      if (byUid.has(enrollment.uid)) continue;
      byUid.set(enrollment.uid, {
        uid: enrollment.uid,
        name: enrollment.displayName || enrollment.email,
        email: enrollment.email,
      });
    }
    const term = search.trim().toLowerCase();
    return [...byUid.values()]
      .filter(
        (student) =>
          !term ||
          student.name.toLowerCase().includes(term) ||
          student.email.toLowerCase().includes(term),
      )
      .slice(0, 50);
  }, [enrollments, search]);

  async function start(studentUid: string) {
    if (!schoolId) return;
    setOpening(studentUid);
    try {
      const { conversationId } = await callOpenConversation({ schoolId, studentUid });
      setOpen(false);
      setSearch("");
      router.push(routes.adminConversation(conversationId));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setOpening(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="subtle" size="sm" className={className}>
          <Plus /> Nouveau
        </Button>
      </DialogTrigger>
      <DialogContent title="Nouvelle conversation" description="Écris à un élève de ton école.">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un élève"
            aria-label="Rechercher un élève"
            className="pl-8"
            autoFocus
          />
        </div>
        <div className="max-h-80 space-y-0.5 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-[13px] text-muted">Chargement…</p>
          ) : students.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">
              {search ? "Aucun élève trouvé." : "Aucun élève inscrit pour l'instant."}
            </p>
          ) : (
            students.map((student) => (
              <button
                key={student.uid}
                type="button"
                disabled={opening !== null}
                onClick={() => void start(student.uid)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface disabled:opacity-60"
              >
                <Avatar name={student.name} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{student.name}</span>
                  {student.name !== student.email ? (
                    <span className="block truncate text-[12px] text-muted">{student.email}</span>
                  ) : null}
                </span>
                {opening === student.uid ? (
                  <span className="text-[12px] text-muted">Ouverture…</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
