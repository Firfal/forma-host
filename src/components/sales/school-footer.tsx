import Link from "next/link";
import { LEGAL_PAGE_IDS, LEGAL_PAGES } from "@shared/legal";
import { routes } from "@shared/paths";

/** Pied de page public d'une école : contact et pages légales (si publiées). */
export function SchoolFooter({
  school,
  hasLegal,
}: {
  school: { name: string; slug: string; supportEmail: string | null };
  hasLegal: boolean;
}) {
  return (
    <footer className="border-t border-line-soft px-4 py-8 text-center text-[12px] text-muted">
      <p>
        © {new Date().getFullYear()} {school.name}
        {school.supportEmail ? (
          <>
            {" "}
            · <a href={`mailto:${school.supportEmail}`}>{school.supportEmail}</a>
          </>
        ) : null}
      </p>
      {hasLegal ? (
        <nav
          aria-label="Informations légales"
          className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1"
        >
          {LEGAL_PAGE_IDS.map((page) => (
            <Link key={page} href={routes.legalPage(school.slug, page)} className="hover:text-ink">
              {LEGAL_PAGES[page]}
            </Link>
          ))}
        </nav>
      ) : null}
    </footer>
  );
}
