import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { publicSchoolUrl } from "@shared/host-routing";
import { visibleLessons } from "@shared/outline";
import { routes } from "@shared/paths";
import { jsonLdScript, schoolJsonLd } from "@shared/structured-data";
import { CourseThumbnail } from "@/components/course/course-thumbnail";
import { LogoMark } from "@/components/logo";
import { SchoolFooter } from "@/components/sales/school-footer";
import { brand } from "@/lib/brand";
import {
  getCreatorBySlug,
  getPublishedCourses,
  getRenamedCreatorSlug,
  getSchoolLegal,
} from "@/lib/public-data";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ creatorSlug: string }>;
}): Promise<Metadata> {
  const creator = await getCreatorBySlug((await params).creatorSlug);
  if (!creator) return { title: { absolute: "Introuvable" } };
  return {
    title: { absolute: `Formations · ${creator.name}` },
    alternates: { canonical: publicSchoolUrl(creator, brand.appUrl) },
  };
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ creatorSlug: string }>;
}) {
  const { creatorSlug } = await params;
  const creator = await getCreatorBySlug(creatorSlug);
  if (!creator) {
    const renamed = await getRenamedCreatorSlug(creatorSlug);
    if (renamed) permanentRedirect(routes.creatorPage(renamed));
    notFound();
  }
  const [courses, legal] = await Promise.all([
    getPublishedCourses(creator.id),
    getSchoolLegal(creator.id),
  ]);

  const structuredData = schoolJsonLd({
    name: creator.name,
    url: publicSchoolUrl(creator, brand.appUrl),
    logoUrl: creator.logoUrl,
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
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
      <SchoolFooter school={creator} hasLegal={Boolean(legal)} />
    </div>
  );
}
