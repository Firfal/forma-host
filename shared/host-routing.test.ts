import { describe, expect, it } from "vitest";
import { domainRewritePath, isPlatformHost, publicSchoolUrl, schoolHref } from "./host-routing";

describe("routage par domaine d'école", () => {
  it("reconnaît les hôtes de la plateforme", () => {
    const app = "forma-host--forma-host.europe-west4.hosted.app";
    expect(isPlatformHost(app, app)).toBe(true);
    expect(isPlatformHost("localhost", app)).toBe(true);
    expect(isPlatformHost("0.0.0.0", app)).toBe(true);
    expect(isPlatformHost("forma-host-abc123-ew.a.run.app", app)).toBe(true);
    expect(isPlatformHost("formation.ecolemotion.com", app)).toBe(false);
  });

  it("sert l'accueil, les pages de vente et les pages légales, laisse les routes de l'app", () => {
    const domain = "app.ecolemotion.com";
    expect(domainRewritePath("/", domain)).toBe("/domaines/app.ecolemotion.com");
    expect(domainRewritePath("/after-effects", domain)).toBe(
      "/domaines/app.ecolemotion.com/after-effects",
    );
    expect(domainRewritePath("/legal/cgv", domain)).toBe("/domaines/app.ecolemotion.com/legal/cgv");
    for (const path of [
      "/connexion",
      "/formations/c1/l1",
      "/admin",
      "/bienvenue/abc",
      "/_next/x",
      "/icon.svg",
      "/ecole-motion/after-effects",
      "/domaines",
    ]) {
      expect(domainRewritePath(path, domain), path).toBeNull();
    }
  });
});

describe("adresse canonique", () => {
  const school = { slug: "ecole-motion", customDomain: null };
  const withDomain = {
    slug: "ecole-motion",
    customDomain: { host: "app.ecolemotion.com", status: "active" },
  };
  it("domaine de l'école s'il est actif, sinon adresse de la plateforme", () => {
    expect(publicSchoolUrl(school, "https://forma.app/")).toBe("https://forma.app/ecole-motion");
    expect(publicSchoolUrl(school, "https://forma.app", "after")).toBe(
      "https://forma.app/ecole-motion/after",
    );
    expect(publicSchoolUrl(withDomain, "https://forma.app")).toBe("https://app.ecolemotion.com/");
    expect(publicSchoolUrl(withDomain, "https://forma.app", "after")).toBe(
      "https://app.ecolemotion.com/after",
    );
    expect(
      publicSchoolUrl(
        { ...withDomain, customDomain: { host: "app.ecolemotion.com", status: "pending" } },
        "https://forma.app",
        "after",
      ),
    ).toBe("https://forma.app/ecole-motion/after");
  });
});

describe("liens des pages publiques d'une école", () => {
  const school = { slug: "ecole-motion" };
  const withDomain = {
    slug: "ecole-motion",
    customDomain: { host: "app.ecolemotion.com", status: "active" },
  };

  it("sans domaine : /ecole/… sur l'adresse courante", () => {
    expect(schoolHref(school)).toBe("/ecole-motion");
    expect(schoolHref(school, "after-effects")).toBe("/ecole-motion/after-effects");
    expect(schoolHref(school, "legal/cgv")).toBe("/ecole-motion/legal/cgv");
  });

  it("domaine actif : adresse finale sur le domaine, sans redirection", () => {
    expect(schoolHref(withDomain)).toBe("https://app.ecolemotion.com/");
    expect(schoolHref(withDomain, "after-effects")).toBe(
      "https://app.ecolemotion.com/after-effects",
    );
    expect(schoolHref(withDomain, "legal/cgv")).toBe("https://app.ecolemotion.com/legal/cgv");
    const pending = {
      ...withDomain,
      customDomain: { host: "app.ecolemotion.com", status: "pending" },
    };
    expect(schoolHref(pending, "after-effects")).toBe("/ecole-motion/after-effects");
  });
});
