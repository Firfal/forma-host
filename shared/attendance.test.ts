import { describe, expect, it } from "vitest";
import {
  activityDay,
  attendanceSummary,
  formatDay,
  formatTimeSpent,
  reviewSummary,
  shouldAskReview,
} from "./attendance";
import { courseReviewInput } from "./course-review-input";

describe("assiduité", () => {
  it("jour d'activité à l'heure de Paris", () => {
    expect(activityDay(new Date("2026-09-27T21:59:00Z"))).toBe("2026-09-27");
    // 23 h 30 à Paris (UTC+2) : déjà le lendemain.
    expect(activityDay(new Date("2026-09-27T22:30:00Z"))).toBe("2026-09-28");
    // Heure d'hiver (UTC+1).
    expect(activityDay(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });

  it("temps passé lisible", () => {
    expect(formatTimeSpent(30)).toBe("moins d'une minute");
    expect(formatTimeSpent(12 * 60 + 40)).toBe("12 min");
    expect(formatTimeSpent(2 * 3600 + 5 * 60)).toBe("2 h 05");
  });

  it("synthèse : total, jours actifs, première et dernière connexion", () => {
    expect(
      attendanceSummary([
        { day: "2026-09-12", seconds: 600 },
        { day: "2026-09-01", seconds: 1200 },
        { day: "2026-09-05", seconds: 0 },
      ]),
    ).toEqual({ totalSeconds: 1800, activeDays: 2, firstDay: "2026-09-01", lastDay: "2026-09-12" });
    expect(attendanceSummary([])).toEqual({
      totalSeconds: 0,
      activeDays: 0,
      firstDay: null,
      lastDay: null,
    });
    expect(formatDay("2026-09-01")).toBe("1 septembre 2026");
  });
});

describe("avis de fin de formation", () => {
  it("note moyenne, recommandation et répartition", () => {
    const summary = reviewSummary([
      { rating: 5, recommend: true },
      { rating: 4, recommend: true },
      { rating: 2, recommend: false },
    ]);
    expect(summary).toMatchObject({ count: 3, average: 3.7, recommendPercent: 67 });
    expect(summary.distribution).toEqual([
      { rating: 5, count: 1 },
      { rating: 4, count: 1 },
      { rating: 3, count: 0 },
      { rating: 2, count: 1 },
      { rating: 1, count: 0 },
    ]);
    expect(reviewSummary([])).toMatchObject({ count: 0, average: 0, recommendPercent: 0 });
  });

  it("proposé à partir de la moitié de la formation", () => {
    expect(shouldAskReview(2, 5)).toBe(false);
    expect(shouldAskReview(3, 6)).toBe(true);
    expect(shouldAskReview(0, 0)).toBe(false);
  });

  it("valide l'avis", () => {
    expect(courseReviewInput.safeParse({ rating: 0, recommend: true, comment: "" }).success).toBe(
      false,
    );
    expect(
      courseReviewInput.safeParse({ rating: 5, recommend: true, comment: " Top " }).data?.comment,
    ).toBe("Top");
  });
});
