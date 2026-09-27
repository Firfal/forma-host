import { describe, expect, it } from "vitest";
import {
  formatTimecode,
  submissionFileError,
  submissionLinkSchema,
  submissionMedia,
} from "./exercises";

describe("exercices à rendre", () => {
  it("accepte vidéos, images et PDF jusqu'à 500 Mo", () => {
    expect(submissionFileError({ type: "video/mp4", size: 10_000_000 })).toBeNull();
    expect(submissionFileError({ type: "video/quicktime", size: 1 })).toBeNull();
    expect(submissionFileError({ type: "image/png", size: 1 })).toBeNull();
    expect(submissionFileError({ type: "application/pdf", size: 1 })).toBeNull();
    expect(submissionFileError({ type: "application/zip", size: 1 })).toMatch(/Formats acceptés/);
    expect(submissionFileError({ type: "image/svg+xml", size: 1 })).toMatch(/Formats acceptés/);
    expect(submissionFileError({ type: "video/mp4", size: 501 * 1024 * 1024 })).toMatch(
      /500 Mo maximum/,
    );
  });

  it("lien : http(s) uniquement", () => {
    expect(submissionLinkSchema.safeParse(" https://youtu.be/abc ").success).toBe(true);
    expect(submissionLinkSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(submissionLinkSchema.safeParse("pas un lien").success).toBe(false);
  });

  it("type de rendu d'après le fichier", () => {
    const file = (contentType: string) => ({
      file: { path: "p", name: "n", size: 1, contentType },
      link: null,
    });
    expect(submissionMedia(file("video/mp4"))).toBe("video");
    expect(submissionMedia(file("image/jpeg"))).toBe("image");
    expect(submissionMedia(file("application/pdf"))).toBe("pdf");
    expect(submissionMedia({ file: null, link: "https://vimeo.com/1" })).toBe("link");
  });

  it("formate les repères de la vidéo", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(65.8)).toBe("1:05");
    expect(formatTimecode(3729)).toBe("1:02:09");
    expect(formatTimecode(-3)).toBe("0:00");
  });
});
