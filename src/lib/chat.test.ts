import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/client", () => ({ db: {} }));

const { groupMessages, lastFromMe } = await import("./chat");

const at = (iso: string) => new Date(iso);

describe("groupMessages", () => {
  it("regroupe par jour et n'affiche l'auteur qu'au début d'une série", () => {
    const messages = [
      { id: "1", authorUid: "anne", createdAt: at("2025-11-03T17:17:00") },
      { id: "2", authorUid: "anne", createdAt: at("2025-11-03T17:18:00") },
      { id: "3", authorUid: "theo", createdAt: at("2025-11-03T18:47:00") },
      { id: "4", authorUid: "theo", createdAt: at("2025-11-03T19:30:00") },
      { id: "5", authorUid: "anne", createdAt: at("2025-11-04T01:09:00") },
    ];
    const groups = groupMessages(messages);
    expect(groups.map((group) => group.day.getDate())).toEqual([3, 4]);
    expect(groups[0].items.map((item) => [item.message.id, item.showHeader])).toEqual([
      ["1", true],
      ["2", false],
      ["3", true],
      // Plus de 10 min après le précédent : l'en-tête revient.
      ["4", true],
    ]);
    expect(groups[1].items[0].showHeader).toBe(true);
  });

  it("un message en cours d'envoi (date inconnue) va avec aujourd'hui", () => {
    const now = at("2025-11-04T10:00:00");
    const groups = groupMessages(
      [
        { authorUid: "anne", createdAt: at("2025-11-04T09:58:00") },
        { authorUid: "anne", createdAt: null },
      ],
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((item) => item.showHeader)).toEqual([true, false]);
  });
});

describe("lastFromMe", () => {
  const conversation = (authorUid: string | null) =>
    ({
      studentUid: "anne",
      lastMessage: authorUid ? { body: "x", authorUid } : null,
    }) as Parameters<typeof lastFromMe>[0];

  it("côté élève : ses propres messages ; côté école : ceux de toute l'équipe", () => {
    expect(lastFromMe(conversation("anne"), "student")).toBe(true);
    expect(lastFromMe(conversation("theo"), "student")).toBe(false);
    expect(lastFromMe(conversation("quentin"), "school")).toBe(true);
    expect(lastFromMe(conversation("anne"), "school")).toBe(false);
    expect(lastFromMe(conversation(null), "school")).toBe(false);
  });
});
