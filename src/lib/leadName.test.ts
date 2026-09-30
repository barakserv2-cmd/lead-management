import { describe, expect, it } from "vitest";
import { isPlaceholderName } from "@/app/api/bridge/from-machine/route";

describe("isPlaceholderName — מתי אין באמת שם", () => {
  it("מציינים ריקים נחשבים חסרי שם", () => {
    expect(isPlaceholderName("לא ידוע")).toBe(true);
    expect(isPlaceholderName("ללא שם ללא שם")).toBe(true);
    expect(isPlaceholderName("  ")).toBe(true);
    expect(isPlaceholderName(null)).toBe(true);
  });

  it("מספר טלפון בתור שם הוא לא שם", () => {
    expect(isPlaceholderName("0521234567")).toBe(true);
    expect(isPlaceholderName("+972 52-123-4567")).toBe(true);
  });

  it("שם אמיתי נשמר", () => {
    expect(isPlaceholderName("נועה יאיר")).toBe(false);
    expect(isPlaceholderName("Hila Kadosh")).toBe(false);
  });
});
