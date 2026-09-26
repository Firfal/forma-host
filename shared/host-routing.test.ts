import { describe, expect, it } from "vitest";
import { isPlatformHost, routeForSchoolHost } from "./host-routing";

describe("routage par domaine d'école", () => {
  it("reconnaît les hôtes de la plateforme", () => {
    const app = "forma-host--forma-host.europe-west4.hosted.app";
    expect(isPlatformHost(app, app)).toBe(true);
    expect(isPlatformHost("localhost", app)).toBe(true);
    expect(isPlatformHost("0.0.0.0", app)).toBe(true);
    expect(isPlatformHost("forma-host-abc123-ew.a.run.app", app)).toBe(true);
    expect(isPlatformHost("formation.ecolemotion.com", app)).toBe(false);
  });

  it("réécrit l'accueil et les pages de vente, laisse les routes de l'app", () => {
    expect(routeForSchoolHost("/", "ecole-motion")).toEqual({
      type: "rewrite",
      pathname: "/ecole-motion",
    });
    expect(routeForSchoolHost("/after-effects", "ecole-motion")).toEqual({
      type: "rewrite",
      pathname: "/ecole-motion/after-effects",
    });
    for (const path of [
      "/connexion",
      "/formations/c1/l1",
      "/admin",
      "/bienvenue/abc",
      "/_next/x",
      "/icon.svg",
    ]) {
      expect(routeForSchoolHost(path, "ecole-motion"), path).toEqual({ type: "next" });
    }
  });

  it("redirige les liens au format de la plateforme vers l'adresse courte", () => {
    expect(routeForSchoolHost("/ecole-motion/after-effects", "ecole-motion")).toEqual({
      type: "redirect",
      pathname: "/after-effects",
    });
    expect(routeForSchoolHost("/ecole-motion", "ecole-motion")).toEqual({
      type: "redirect",
      pathname: "/",
    });
  });
});
