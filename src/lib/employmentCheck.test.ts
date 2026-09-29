import { describe, it, expect } from "vitest";
import { classifyActiveWorkers, type ActiveWorker } from "./employmentCheck";

const TODAY = "2026-09-29";

function w(id: string, over: Partial<ActiveWorker> = {}): ActiveWorker {
  return {
    id,
    name: id,
    phone: null,
    status: "STARTED",
    start_date: "2026-09-20",
    hired_client: "אסטרל",
    handled_by: null,
    last_inbound: "2026-09-25T10:00:00Z",
    ...over,
  };
}

describe("classifyActiveWorkers", () => {
  it("flags a hire whose start date passed but was never marked started", () => {
    const r = classifyActiveWorkers([w("a", { status: "HIRED" })], TODAY);
    expect(r[0].reasons).toEqual(["not_started"]);
  });

  it("does not flag a hire whose start date is today", () => {
    expect(classifyActiveWorkers([w("a", { status: "HIRED", start_date: TODAY, last_inbound: null })], TODAY)).toEqual([]);
  });

  it("flags a worker who has not written since starting, after a few days", () => {
    const r = classifyActiveWorkers([w("a", { last_inbound: "2026-09-10T10:00:00Z" })], TODAY);
    expect(r[0].reasons).toEqual(["no_contact"]);
    expect(classifyActiveWorkers([w("b", { start_date: "2026-09-28", last_inbound: null })], TODAY)).toEqual([]);
  });

  it("leaves active, in-touch workers off the list and puts double signals first", () => {
    const r = classifyActiveWorkers(
      [w("ok"), w("one", { last_inbound: null }), w("two", { status: "HIRED", last_inbound: null })],
      TODAY
    );
    expect(r.map((x) => x.id)).toEqual(["two", "one"]);
  });
});
