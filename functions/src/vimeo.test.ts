import { describe, expect, it } from "vitest";
import { fromApi, fromOEmbed, pickThumbnail } from "./vimeo";

const ref = { id: "123456", hash: "abc" };

describe("vimeo", () => {
  it("choisit une miniature d'au moins 960 px", () => {
    expect(
      pickThumbnail({
        sizes: [
          { width: 1920, link: "big" },
          { width: 640, link: "small" },
          { width: 1280, link: "hd" },
        ],
      }),
    ).toBe("hd");
    expect(pickThumbnail({ sizes: [{ width: 200, link: "tiny" }] })).toBe("tiny");
    expect(pickThumbnail(undefined)).toBeNull();
  });

  it("convertit la réponse API", () => {
    expect(fromApi(ref, { name: "Intro", duration: 125, pictures: { base_link: "base" } })).toEqual(
      {
        provider: "vimeo",
        id: "123456",
        hash: "abc",
        title: "Intro",
        durationSec: 125,
        thumbnailUrl: "base",
      },
    );
  });

  it("demande une miniature HD à oEmbed", () => {
    expect(
      fromOEmbed(ref, {
        title: "Intro",
        duration: 60,
        thumbnail_url: "https://i.vimeocdn.com/video/1-d_295x166",
      }).thumbnailUrl,
    ).toBe("https://i.vimeocdn.com/video/1-d_1280x720");
    expect(
      fromOEmbed(ref, { thumbnail_url: "https://i.vimeocdn.com/video/1-d_295x166?region=us" })
        .thumbnailUrl,
    ).toBe("https://i.vimeocdn.com/video/1-d_1280x720?region=us");
    expect(
      fromOEmbed(ref, { thumbnail_url: "https://i.vimeocdn.com/video/1-d_640x360.jpg" })
        .thumbnailUrl,
    ).toBe("https://i.vimeocdn.com/video/1-d_1280x720.jpg");
  });
});
