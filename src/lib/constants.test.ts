import { describe, it, expect } from "vitest";
import {
  LEAD_SOURCES,
  MACHINE_LEAD_SOURCES,
  ALL_LEAD_SOURCES,
  GUBGET_SOURCE,
} from "./constants";

// גורם הגיוס נכתב משני כיוונים: הרכזת בוחרת מרשימה, והקוד (גשר המכונה, ייבוא,
// וובהוק) כותב ערכים משלו. הבדיקות שומרות שהבורר יישאר נקי ושהדוחות עדיין
// יראו את הכל.
describe("lead sources", () => {
  it("keeps machine-written sources out of the manual picker", () => {
    for (const s of MACHINE_LEAD_SOURCES) {
      expect(LEAD_SOURCES).not.toContain(s);
    }
  });

  it("counts גובגט as a machine source, not a manual one", () => {
    expect(MACHINE_LEAD_SOURCES).toContain(GUBGET_SOURCE);
    expect(LEAD_SOURCES).not.toContain(GUBGET_SOURCE as never);
  });

  it("unions both lists for reports and filters", () => {
    for (const s of [...LEAD_SOURCES, ...MACHINE_LEAD_SOURCES]) {
      expect(ALL_LEAD_SOURCES).toContain(s);
    }
    expect(new Set(ALL_LEAD_SOURCES).size).toBe(ALL_LEAD_SOURCES.length);
  });
});
