import { ArrowRight, CheckCircle2, ChevronDown, Clock, PlayCircle, Unlock } from "lucide-react";
import type { CSSProperties } from "react";
import { formatDuration, groupByChapter, visibleLessons } from "@shared/outline";
import { routes } from "@shared/paths";
import type { CourseDoc, CreatorDoc, SalesPage, VimeoVideo } from "@shared/types";
import { CourseThumbnail } from "@/components/course/course-thumbnail";
import { RichText } from "@/components/editor/rich-text";
import { LogoMark } from "@/components/logo";
import { VimeoPlayer } from "@/components/video/vimeo-player";

export interface SalesPageViewProps {
  course: CourseDoc & { id: string };
  creator: CreatorDoc;
  page: SalesPage;
  ctaUrl: string | null;
  preview: { lessonTitle: string; video: VimeoVideo } | null;
}

function CtaButton({
  page,
  ctaUrl,
  courseId,
}: {
  page: SalesPage;
  ctaUrl: string | null;
  courseId: string;
}) {
  const href = ctaUrl ?? routes.course(courseId);
  return (
    <div className="flex flex-col items-center gap-2">
      <a
        href={href}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-7 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-[var(--brand)]/25 transition hover:brightness-110"
      >
        {page.ctaLabel} <ArrowRight className="size-4" />
      </a>
      {page.priceLabel ? <p className="text-[13px] text-muted">{page.priceLabel}</p> : null}
    </div>
  );
}

/** Page de vente publique : un modèle fixe, dans l'esprit des landing pages de la maquette. */
export function SalesPageView({ course, creator, page, ctaUrl, preview }: SalesPageViewProps) {
  const lessons = visibleLessons(course.items);
  const chapters = groupByChapter(course.items);
  const totalSeconds = lessons.reduce((sum, lesson) => sum + (lesson.durationSec ?? 0), 0);
  const brandColor = /^#[0-9a-f]{6}$/i.test(creator.brandColor) ? creator.brandColor : "#5a0eb5";

  return (
    <div style={{ "--brand": brandColor } as CSSProperties} className="min-h-dvh bg-white">
      {page.announcement ? (
        <div className="bg-[var(--brand)] px-4 py-2 text-center text-[13px] font-semibold text-white">
          {page.announcement}
        </div>
      ) : null}

      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          {creator.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creator.logoUrl} alt="" className="size-7 rounded-md object-cover" />
          ) : (
            <LogoMark size={26} />
          )}
          <span className="font-semibold">{creator.name}</span>
        </div>
        <a
          href={routes.course(course.id)}
          className="text-[13px] font-medium text-muted hover:text-ink"
        >
          Déjà inscrit ? Accéder à la formation
        </a>
      </header>

      <section className="mx-auto max-w-4xl px-4 pb-14 pt-8 text-center md:pt-14">
        <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight md:text-5xl">
          {page.headline}
        </h1>
        {page.subheadline ? (
          <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-muted md:text-lg">
            {page.subheadline}
          </p>
        ) : null}
        <div className="mt-8">
          <CtaButton page={page} ctaUrl={ctaUrl} courseId={course.id} />
        </div>
        <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-xl border border-line shadow-xl shadow-black/5">
          {preview ? (
            <VimeoPlayer video={preview.video} title={preview.lessonTitle} />
          ) : (
            <CourseThumbnail src={course.thumbnailUrl} title={course.title} />
          )}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <PlayCircle className="size-4" /> {lessons.length} leçons vidéo
          </span>
          {totalSeconds > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" /> {formatDuration(totalSeconds)} de contenu
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-4" /> Accès à vie, à ton rythme
          </span>
        </div>
      </section>

      {course.description ? (
        <section className="border-t border-line-soft bg-surface/60">
          <div className="mx-auto max-w-3xl px-4 py-14">
            <h2 className="mb-5 text-2xl font-bold tracking-tight">La formation</h2>
            <RichText doc={course.description} className="text-[15px] leading-7" />
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="text-center text-2xl font-bold tracking-tight">Le programme</h2>
        <p className="mt-2 text-center text-muted">
          {chapters.filter((group) => group.chapter).length} chapitres · {lessons.length} leçons
        </p>
        <ol className="mt-8 space-y-3">
          {chapters.map((group, index) => (
            <li
              key={group.chapter?.id ?? "intro"}
              className="rounded-xl border border-line bg-white"
            >
              <details open={index === 0} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-sm font-bold text-[var(--brand)]">
                    {index + 1}
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">
                      {group.chapter?.title ?? "Introduction"}
                    </span>
                    <span className="block text-[13px] text-muted">
                      {group.lessonCount} leçon{group.lessonCount > 1 ? "s" : ""}
                    </span>
                  </span>
                  <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <ul className="border-t border-line-soft px-5 py-3">
                  {group.items.map((item) =>
                    item.kind === "subchapter" ? (
                      <li
                        key={item.id}
                        className="pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted"
                      >
                        {item.title}
                      </li>
                    ) : (
                      <li key={item.id} className="flex items-center gap-3 py-1.5 text-sm">
                        <PlayCircle className="size-4 shrink-0 text-muted" />
                        <span className="flex-1">{item.title}</span>
                        {item.isPreview ? (
                          <span className="inline-flex items-center gap-1 rounded bg-[var(--brand)]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--brand)]">
                            <Unlock className="size-3" /> Aperçu gratuit
                          </span>
                        ) : null}
                        <span className="text-[12px] tabular-nums text-muted">
                          {formatDuration(item.durationSec)}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              </details>
            </li>
          ))}
        </ol>
        <div className="mt-10">
          <CtaButton page={page} ctaUrl={ctaUrl} courseId={course.id} />
        </div>
      </section>

      {page.testimonials.length ? (
        <section className="border-t border-line-soft bg-surface/60">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-center text-2xl font-bold tracking-tight">Ils témoignent</h2>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              {page.testimonials.map((testimonial, index) => (
                <figure
                  key={index}
                  className="w-full rounded-xl border border-line bg-white p-5 md:w-[calc((100%-2rem)/3)]"
                >
                  <blockquote className="text-[15px] leading-7">« {testimonial.quote} »</blockquote>
                  {testimonial.name ? (
                    <figcaption className="mt-4 text-sm font-semibold">
                      {testimonial.name}
                    </figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {page.aboutText ? (
        <section className="mx-auto max-w-4xl px-4 py-14">
          <div className="rounded-2xl bg-[var(--brand)] p-8 text-white md:p-10">
            <h2 className="text-2xl font-bold tracking-tight">{page.aboutTitle}</h2>
            <p className="mt-4 whitespace-pre-line text-[15px] leading-7 text-white/90">
              {page.aboutText}
            </p>
          </div>
        </section>
      ) : null}

      {page.faq.length ? (
        <section className="mx-auto max-w-3xl px-4 py-14">
          <h2 className="text-center text-2xl font-bold tracking-tight">Questions fréquentes</h2>
          <div className="mt-8 divide-y divide-line-soft rounded-xl border border-line">
            {page.faq.map((item, index) => (
              <details key={index} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {item.question}
                  <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
          <div className="mt-10">
            <CtaButton page={page} ctaUrl={ctaUrl} courseId={course.id} />
          </div>
        </section>
      ) : null}

      <footer className="border-t border-line-soft px-4 py-8 text-center text-[12px] text-muted">
        © {new Date().getFullYear()} {creator.name}
        {creator.supportEmail ? (
          <>
            {" "}
            · <a href={`mailto:${creator.supportEmail}`}>{creator.supportEmail}</a>
          </>
        ) : null}
      </footer>
    </div>
  );
}
