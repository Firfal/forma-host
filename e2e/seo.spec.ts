import { expect, test } from "@playwright/test";

test("référencement : robots.txt, plan du site, adresse canonique et données structurées", async ({
  request,
  page,
}) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
  expect(robots).toContain("Disallow: /formations");
  expect(robots).toMatch(/Sitemap: https?:\/\/localhost:3100\/sitemap\.xml/);

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/ecole-motion/maitriser-after-effects</loc>");

  await page.goto("/ecole-motion/maitriser-after-effects");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/ecole-motion\/maitriser-after-effects$/,
  );
  const jsonLd = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
  );
  expect(jsonLd["@type"]).toBe("Course");
  expect(jsonLd.provider.name).toBe("Ecole Motion");
});
