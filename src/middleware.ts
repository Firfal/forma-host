import { NextResponse, type NextRequest } from "next/server";
import { isPlatformHost, routeForSchoolHost } from "@shared/host-routing";

/**
 * Domaines personnalisés des écoles : formation.ecolemotion.com affiche directement la page de
 * l'école et ses pages de vente. Sur l'adresse de la plateforme, rien n'est modifié.
 */

const appHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").host;
  } catch {
    return "";
  }
})();

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .toLowerCase();
  if (!host || isPlatformHost(host, appHost)) return NextResponse.next();

  let slug: string | null = null;
  try {
    // Chargé à la demande : l'adresse de la plateforme n'utilise jamais l'Admin SDK ici.
    const { schoolSlugForHost } = await import("@/lib/school-domains");
    slug = await schoolSlugForHost(host);
  } catch (error) {
    console.error("middleware", error);
  }
  if (!slug) return NextResponse.next();

  const route = routeForSchoolHost(request.nextUrl.pathname, slug);
  if (route.type === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = route.pathname;
    return NextResponse.rewrite(url);
  }
  if (route.type === "redirect") {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0] ?? "https";
    return NextResponse.redirect(
      new URL(`${route.pathname}${request.nextUrl.search}`, `${proto}://${host}`),
      301,
    );
  }
  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
