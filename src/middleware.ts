import { NextResponse, type NextRequest } from "next/server";
import { domainRewritePath, isPlatformHost } from "@shared/host-routing";

/**
 * Domaines personnalisés des écoles (formation.ecolemotion.com) : la réécriture vers les pages
 * /domaines/{domaine}/… est faite par next.config (en-tête Host), ce qui garde ces pages en cache
 * (une réécriture faite ici désactive le cache des pages dans Next.js 15.5). Ce middleware n'est
 * qu'un secours, sans lecture de base : domaine transmis seulement par un proxy (x-forwarded-host).
 */

const appHostname = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

const hostnameOf = (value: string | null) =>
  (value ?? "").split(",")[0].trim().split(":")[0].toLowerCase();

export function middleware(request: NextRequest) {
  const host = hostnameOf(request.headers.get("host"));
  if (host && !isPlatformHost(host, appHostname)) return NextResponse.next();
  const forwarded = hostnameOf(request.headers.get("x-forwarded-host"));
  if (!forwarded || isPlatformHost(forwarded, appHostname)) return NextResponse.next();
  const pathname = domainRewritePath(request.nextUrl.pathname, forwarded);
  if (!pathname) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
