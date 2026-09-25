import { describe, expect, it } from "vitest";
import { parseVimeoUrl, vimeoEmbedUrl } from "./vimeo";

describe("parseVimeoUrl", () => {
  it.each([
    ["https://vimeo.com/123456789", { id: "123456789", hash: null }],
    ["vimeo.com/123456789/abcdef1234", { id: "123456789", hash: "abcdef1234" }],
    ["https://vimeo.com/123456789?share=copy", { id: "123456789", hash: null }],
    [
      "https://player.vimeo.com/video/123456789?h=abcdef1234&badge=0",
      { id: "123456789", hash: "abcdef1234" },
    ],
    [
      "https://vimeo.com/manage/videos/123456789/abcdef1234",
      { id: "123456789", hash: "abcdef1234" },
    ],
    ["https://vimeo.com/channels/staffpicks/123456789", { id: "123456789", hash: null }],
    [
      '<iframe src="https://player.vimeo.com/video/123456789?h=abcdef1234&amp;badge=0" frameborder="0"></iframe>',
      { id: "123456789", hash: "abcdef1234" },
    ],
  ])("%s", (input, expected) => {
    expect(parseVimeoUrl(input)).toEqual(expected);
  });

  it("refuse les autres domaines et les liens sans identifiant", () => {
    expect(parseVimeoUrl("https://youtube.com/watch?v=123456789")).toBeNull();
    expect(parseVimeoUrl("https://vimeo.com/user123")).toBeNull();
    expect(parseVimeoUrl("pas une url")).toBeNull();
  });

  it("construit l'URL du lecteur", () => {
    expect(vimeoEmbedUrl({ id: "1234567", hash: "abc123" })).toBe(
      "https://player.vimeo.com/video/1234567?dnt=1&h=abc123",
    );
  });
});
