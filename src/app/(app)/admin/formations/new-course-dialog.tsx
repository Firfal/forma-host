"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { routes } from "@shared/paths";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { createCourse } from "@/lib/courses";
import { errorMessage } from "@/lib/firebase/callables";

export function NewCourseDialog({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user || !title.trim()) return;
    setCreating(true);
    try {
      const courseId = await createCourse(user.uid, title);
      setOpen(false);
      router.push(routes.adminCourseContent(courseId));
    } catch (error) {
      toast.error(errorMessage(error));
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{children}</Button>
      </DialogTrigger>
      <DialogContent title="Nouvelle formation" description="Tu pourras tout modifier ensuite.">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Titre" htmlFor="course-title">
            <Input
              id="course-title"
              autoFocus
              placeholder="Formation complète : Maîtriser After Effects de A à Z"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={creating || !title.trim()}>
              {creating ? "Création…" : "Créer la formation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
