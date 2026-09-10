import { describe, it, expect } from "vitest";
import {
  LeadStatus,
  ALL_STATUSES,
  TRANSITION_MAP,
  validateTransition,
  getAllowedTransitions,
  actorFromUserId,
  MACHINE_ALLOWED_FROM,
  MACHINE_ALLOWED_TO,
} from "./stateMachine";

const S = LeadStatus;

describe("transition map integrity", () => {
  it("every status has an entry and only points at real statuses", () => {
    for (const from of ALL_STATUSES) {
      const targets = TRANSITION_MAP[from];
      expect(targets, from).toBeDefined();
      for (const to of targets) expect(ALL_STATUSES).toContain(to);
      expect(targets).not.toContain(from);
    }
  });

  it("no status is a dead end (every status can leave)", () => {
    for (const from of ALL_STATUSES) expect(TRANSITION_MAP[from].length).toBeGreaterThan(0);
  });
});

describe("recruiter (human) moves", () => {
  it("allows the everyday forward skips recruiters actually make", () => {
    expect(validateTransition(S.NEW_LEAD, S.INTERVIEW_BOOKED, { interview_date: "2026-09-10T10:00" }).valid).toBe(true);
    expect(validateTransition(S.NEW_LEAD, S.NOT_SUITABLE).valid).toBe(true);
    expect(validateTransition(S.CONTACTED, S.NOT_SUITABLE).valid).toBe(true);
    expect(validateTransition(S.NEW_LEAD, S.LOST_CONTACT).valid).toBe(true);
    expect(validateTransition(S.INTERVIEW_BOOKED, S.HIRED, { human_approval: true }).valid).toBe(true);
  });

  it("lets a human move to FIT_FOR_INTERVIEW without a numeric score", () => {
    expect(validateTransition(S.CONTACTED, S.FIT_FOR_INTERVIEW, { actor: "human" }).valid).toBe(true);
  });

  it("blocks STARTED unless the lead was HIRED first", () => {
    for (const from of ALL_STATUSES.filter((s) => s !== S.HIRED && s !== S.STARTED)) {
      expect(validateTransition(from, S.STARTED).valid, from).toBe(false);
    }
    expect(validateTransition(S.HIRED, S.STARTED).valid).toBe(true);
  });

  it("blocks EMPLOYMENT_ENDED for someone who was never hired", () => {
    expect(validateTransition(S.NEW_LEAD, S.EMPLOYMENT_ENDED).valid).toBe(false);
    expect(validateTransition(S.NO_SHOW, S.EMPLOYMENT_ENDED).valid).toBe(false);
    expect(validateTransition(S.STARTED, S.EMPLOYMENT_ENDED).valid).toBe(true);
    expect(validateTransition(S.HIRED, S.EMPLOYMENT_ENDED).valid).toBe(true);
  });

  it("allows NO_SHOW only when an interview existed to miss", () => {
    expect(validateTransition(S.NEW_LEAD, S.NO_SHOW).valid).toBe(false);
    expect(validateTransition(S.CONTACTED, S.NO_SHOW).valid).toBe(false);
    expect(validateTransition(S.INTERVIEW_BOOKED, S.NO_SHOW).valid).toBe(true);
    expect(validateTransition(S.ARRIVED, S.NO_SHOW).valid).toBe(true);
  });

  it("allows NOT_ACCEPTED only after an interview stage", () => {
    expect(validateTransition(S.NEW_LEAD, S.NOT_ACCEPTED).valid).toBe(false);
    expect(validateTransition(S.SCREENING_IN_PROGRESS, S.NOT_ACCEPTED).valid).toBe(false);
    expect(validateTransition(S.ARRIVED, S.NOT_ACCEPTED).valid).toBe(true);
    expect(validateTransition(S.HIRED, S.NOT_ACCEPTED).valid).toBe(true);
  });

  it("requires a booked interview before ARRIVED", () => {
    expect(validateTransition(S.NEW_LEAD, S.ARRIVED).valid).toBe(false);
    expect(validateTransition(S.CONTACTED, S.ARRIVED).valid).toBe(false);
    expect(validateTransition(S.INTERVIEW_BOOKED, S.ARRIVED).valid).toBe(true);
  });

  it("never regresses a hired candidate into the funnel", () => {
    for (const from of [S.HIRED, S.STARTED, S.EMPLOYMENT_ENDED]) {
      for (const to of [S.NEW_LEAD, S.SCREENING_IN_PROGRESS, S.FIT_FOR_INTERVIEW, S.INTERVIEW_BOOKED]) {
        expect(validateTransition(from, to).valid, `${from} -> ${to}`).toBe(false);
      }
    }
  });

  it("lets closed leads be reopened or reclassified", () => {
    expect(validateTransition(S.NOT_SUITABLE, S.INTERVIEW_BOOKED, { interview_date: "2026-09-10T10:00" }).valid).toBe(true);
    expect(validateTransition(S.LOST_CONTACT, S.CONTACTED).valid).toBe(true);
    expect(validateTransition(S.LOST_CONTACT, S.NOT_SUITABLE).valid).toBe(true);
    expect(validateTransition(S.REJECTED, S.NEW_LEAD).valid).toBe(true);
    expect(validateTransition(S.NO_SHOW, S.INTERVIEW_BOOKED, { interview_date: "2026-09-10T10:00" }).valid).toBe(true);
  });
});

describe("guardrails", () => {
  it("INTERVIEW_BOOKED needs an interview date", () => {
    expect(validateTransition(S.FIT_FOR_INTERVIEW, S.INTERVIEW_BOOKED, {}).valid).toBe(false);
    expect(validateTransition(S.FIT_FOR_INTERVIEW, S.INTERVIEW_BOOKED, { interview_date: "2026-09-10T10:00" }).valid).toBe(true);
  });

  it("HIRED needs human approval", () => {
    expect(validateTransition(S.ARRIVED, S.HIRED, { human_approval: false }).valid).toBe(false);
    expect(validateTransition(S.ARRIVED, S.HIRED, { human_approval: true }).valid).toBe(true);
  });

  it("automated actors need a screening score for FIT_FOR_INTERVIEW", () => {
    expect(validateTransition(S.SCREENING_IN_PROGRESS, S.FIT_FOR_INTERVIEW, { actor: "machine" }).valid).toBe(false);
    expect(validateTransition(S.SCREENING_IN_PROGRESS, S.FIT_FOR_INTERVIEW, { actor: "machine", screening_score: 72 }).valid).toBe(true);
    expect(validateTransition(S.SCREENING_IN_PROGRESS, S.FIT_FOR_INTERVIEW, { actor: "system", screening_score: 0 }).valid).toBe(false);
  });

  it("same-status is a no-op, unknown source status may move once", () => {
    expect(validateTransition(S.HIRED, S.HIRED).valid).toBe(true);
    expect(validateTransition("LEGACY" as never, S.NEW_LEAD).valid).toBe(true);
    expect(validateTransition(S.NEW_LEAD, "NOPE" as never).valid).toBe(false);
  });
});

describe("machine (גובגט) scope", () => {
  const m = { actor: "machine" as const, screening_score: 80, interview_date: "2026-09-10T10:00" };

  it("works the pre-interview funnel", () => {
    expect(validateTransition(S.NEW_LEAD, S.SCREENING_IN_PROGRESS, m).valid).toBe(true);
    expect(validateTransition(S.SCREENING_IN_PROGRESS, S.FIT_FOR_INTERVIEW, m).valid).toBe(true);
    expect(validateTransition(S.FIT_FOR_INTERVIEW, S.INTERVIEW_BOOKED, m).valid).toBe(true);
    expect(validateTransition(S.SCREENING_IN_PROGRESS, S.NOT_SUITABLE, m).valid).toBe(true);
    expect(validateTransition(S.LOST_CONTACT, S.SCREENING_IN_PROGRESS, m).valid).toBe(true);
  });

  it("never hires, rejects, or marks arrival", () => {
    expect(validateTransition(S.ARRIVED, S.HIRED, { ...m, human_approval: true }).valid).toBe(false);
    expect(validateTransition(S.NEW_LEAD, S.HIRED, { ...m, human_approval: true }).valid).toBe(false);
    expect(validateTransition(S.NEW_LEAD, S.REJECTED, m).valid).toBe(false);
    expect(validateTransition(S.INTERVIEW_BOOKED, S.ARRIVED, m).valid).toBe(false);
  });

  it("never touches a lead past the interview or a human closure", () => {
    for (const from of [S.INTERVIEW_BOOKED, S.ARRIVED, S.HIRED, S.STARTED, S.REJECTED, S.NOT_SUITABLE, S.NOT_ACCEPTED, S.NO_SHOW]) {
      expect(validateTransition(from, S.SCREENING_IN_PROGRESS, m).valid, from).toBe(false);
    }
    // the reconciliation cron re-pushing INTERVIEW_BOOKED must not regress
    expect(validateTransition(S.ARRIVED, S.INTERVIEW_BOOKED, m).valid).toBe(false);
    expect(validateTransition(S.HIRED, S.INTERVIEW_BOOKED, m).valid).toBe(false);
  });

  it("getAllowedTransitions respects the machine scope", () => {
    expect(getAllowedTransitions(S.HIRED, "machine")).toEqual([]);
    const fromNew = getAllowedTransitions(S.NEW_LEAD, "machine");
    for (const t of fromNew) expect(MACHINE_ALLOWED_TO).toContain(t);
    expect(fromNew).not.toContain(S.HIRED);
    for (const from of MACHINE_ALLOWED_FROM) expect(getAllowedTransitions(from, "machine").length).toBeGreaterThan(0);
  });
});

describe("actorFromUserId", () => {
  it("classifies recruiters, the machine, and the system", () => {
    expect(actorFromUserId("tami@eilatjobs.com")).toBe("human");
    expect(actorFromUserId("user")).toBe("human");
    expect(actorFromUserId("gubget@eilatjobs.com")).toBe("machine");
    expect(actorFromUserId("ai-recruiter")).toBe("machine");
    expect(actorFromUserId("system")).toBe("system");
    expect(actorFromUserId(undefined)).toBe("system");
  });
});
