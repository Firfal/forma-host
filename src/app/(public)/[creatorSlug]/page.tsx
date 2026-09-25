import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { visibleLessons } from "@shared/outline";
import { routes } from "@shared/paths";
import { CourseThumbnail } from "@/components/course/course-thumbnail";
import { LogoMark } from "@/components/logo";
import { getCreatorBySlug, getPublishedCourses } from "@/lib/public-data";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ creatorSlug: string }>;
}): Promise<Metadata> {
  const creator = await getCreatorBySlug((await params).creatorSlug);
  return { title: { absolute: creator ? `Formations · ${creator.name}` : "Introuvable" } };
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ creatorSlug: string }>;
}) {
  const creator = await getCreatorBySlug((await params).creatorSlug);
  if (!creator) notFound();
  const courses = await getPublishedCourses(creator.id);

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 py-12">
      <header className="mb-10 flex items-center gap-3">
        {creator.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.logoUrl} alt="" className="size-10 rounded-lg object-cover" />
        ) : (
          <LogoMark size={36} />
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{creator.name}</h1>
          <p className="text-[13px] text-muted">Formations en ligne</p>
        </div>
      </header>
      {courses.length === 0 ? (
        <p className="text-muted">Aucune formation publiée pour le moment.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={routes.salesPage(creator.slug, course.slug)}
              className="overflow-hidden rounded-xl border border-line transition hover:shadow-lg hover:shadow-black/5"
            >
              <CourseThumbnail src={course.thumbnailUrl} title={course.title} />
              <div className="p-4">
                <p className="font-semibold">{course.title}</p>
                {course.summary ? (
                  <p className="mt-1 line-clamp-2 text-[13px] text-muted">{course.summary}</p>
                ) : null}
                <p className="mt-3 text-[12px] text-muted">
                  {visibleLessons(course.items).length} leçons
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
