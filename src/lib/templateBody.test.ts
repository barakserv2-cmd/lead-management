import { describe, expect, it } from "vitest";
import { countTemplateParams, renderTemplateBody } from "./whatsappService";

/**
 * תבנית שרכזת שולחת מתוך הצ'אט. אם הספירה שגויה מטא דוחה את ההודעה;
 * אם הרינדור שגוי, מה שנשמר בצ'אט לא תואם את מה שהמועמד/ת קיבלו.
 */
describe("template body", () => {
  it("counts the highest placeholder, not the occurrences", () => {
    expect(countTemplateParams("היי {{1}}, כאן תמי")).toBe(1);
    expect(countTemplateParams("{{1}} {{2}} ושוב {{1}}")).toBe(2);
    expect(countTemplateParams("בלי משתנים")).toBe(0);
  });

  it("renders what the candidate actually sees", () => {
    expect(renderTemplateBody("היי {{1}}, משרת {{2}}", ["דנה", "מלצרות"])).toBe("היי דנה, משרת מלצרות");
  });

  it("leaves a missing value visible instead of printing undefined", () => {
    expect(renderTemplateBody("היי {{1}}, משרת {{2}}", ["דנה"])).toBe("היי דנה, משרת {{2}}");
  });
});
