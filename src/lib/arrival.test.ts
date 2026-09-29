import { describe, it, expect } from "vitest";
import { analyzeArrivals, type ArrivalLead } from "./arrival";

const TODAY = "2026-09-28";

function booked(id: string, status: string, opts: Partial<ArrivalLead> = {}): ArrivalLead {
  return {
    id,
    status,
    source: "פייסבוק",
    interview_date: "2026-09-20T10:00:00+00:00",
    candidate_segment: null,
    comes_with_friend: null,
    no_arrival_reason: null,
    ...opts,
  };
}

describe("analyzeArrivals — outcome", () => {
  it("separates arrived, not arrived and still pending", () => {
    const r = analyzeArrivals(
      [
        booked("a", "HIRED"),
        booked("b", "NO_SHOW", { no_arrival_reason: "friend_backed_out" }),
        booked("c", "INTERVIEW_BOOKED"),
      ],
      new Set(),
      TODAY
    );
    expect(r.totals).toMatchObject({ booked: 3, arrived: 1, notArrived: 1, pending: 1, rate: 0.5 });
  });

  it("counts a lead as arrived when history shows it, even if it was closed later", () => {
    const r = analyzeArrivals([booked("a", "REJECTED")], new Set(["a"]), TODAY);
    expect(r.totals.arrived).toBe(1);
  });

  it("treats a booked lead that was closed without arriving as not arrived", () => {
    const r = analyzeArrivals([booked("a", "LOST_CONTACT")], new Set(), TODAY);
    expect(r.totals.notArrived).toBe(1);
    expect(r.reasons).toEqual([{ code: null, label: "לא צוין", count: 1 }]);
  });

  it("ignores interviews outside the last 90 days and today's interviews", () => {
    const r = analyzeArrivals(
      [
        booked("old", "NO_SHOW", { interview_date: "2026-06-01T10:00:00+00:00" }),
        booked("today", "INTERVIEW_BOOKED", { interview_date: "2026-09-28T09:00:00+00:00" }),
        booked("none", "NO_SHOW", { interview_date: null }),
      ],
      new Set(),
      TODAY
    );
    expect(r.totals.booked).toBe(0);
    expect(r.totals.rate).toBeNull();
  });
});

describe("analyzeArrivals — groups and reasons", () => {
  it("compares arrival with a friend against arriving alone", () => {
    const r = analyzeArrivals(
      [
        booked("a", "ARRIVED", { comes_with_friend: true }),
        booked("b", "HIRED", { comes_with_friend: true }),
        booked("c", "NO_SHOW", { comes_with_friend: false }),
        booked("d", "ARRIVED", { comes_with_friend: false }),
      ],
      new Set(),
      TODAY
    );
    expect(r.byFriend.find((g) => g.key === "עם חבר")?.rate).toBe(1);
    expect(r.byFriend.find((g) => g.key === "לבד")?.rate).toBe(0.5);
  });

  it("ranks no-arrival reasons by count", () => {
    const r = analyzeArrivals(
      [
        booked("a", "NO_SHOW", { no_arrival_reason: "personal" }),
        booked("b", "CANCELLED_ARRIVAL", { no_arrival_reason: "friend_backed_out" }),
        booked("c", "CANCELLED_ARRIVAL", { no_arrival_reason: "friend_backed_out" }),
      ],
      new Set(),
      TODAY
    );
    expect(r.reasons[0]).toEqual({ code: "friend_backed_out", label: "החבר שהיה אמור להגיע התחרט", count: 2 });
  });
});
