"use client";

import { Copy, Eye, ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { visibleLessons } from "@shared/outline";
import { routes } from "@shared/paths";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteDraftCourse, setCourseStatus, type CourseWithId } from "@/lib/courses";
import { useCreator } from "@/lib/creator";
import { errorMessage } from "@/lib/firebase/callables";

export function CourseActions({ course }: { course: CourseWithId }) {
  const router = useRouter();
  const { data: creator } = useCreator(course.creatorId);
  const [busy, setBusy] = useState(false);
  const published = course.status === "published";
  const salesPath = creator ? routes.salesPage(creator.slug, course.slug) : null;

  async function togglePublished() {
    if (!published && visibleLessons(course.items).length === 0) {
      toast.error("Ajoute au moins une leçon avant de publier.");
      return;
    }
    setBusy(true);
    try {
      await setCourseStatus(course, published ? "draft" : "published");
      toast.success(published ? "Formation repassée en brouillon" : "Formation publiée !");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function copySalesLink() {
    if (!salesPath) return;
    await navigator.clipboard.writeText(`${window.location.origin}${salesPath}`);
    toast.success("Lien copié");
  }

  async function remove() {
    if (!window.confirm(`Supprimer définitivement « ${course.title} » et ses leçons ?`)) return;
    try {
      await deleteDraftCourse(course);
      toast.success("Formation supprimée");
      router.replace(routes.adminCourses);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="secondary" size="sm">
        <Link href={routes.course(course.id)}>
          <Eye /> Voir en élève
        </Link>
      </Button>
      <Button
        size="sm"
        variant={published ? "secondary" : "primary"}
        onClick={togglePublished}
        disabled={busy}
      >
        {published ? "Dépublier" : "Publier"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Plus d'actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {salesPath ? (
            <>
              <DropdownMenuItem asChild disabled={!published}>
                <a href={salesPath} target="_blank" rel="noreferrer">
                  <ExternalLink /> Voir la page de vente
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copySalesLink()}>
                <Copy /> Copier le lien de la page de vente
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem tone="danger" disabled={published} onSelect={() => void remove()}>
            <Trash2 /> {published ? "Dépublier pour supprimer" : "Supprimer…"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
