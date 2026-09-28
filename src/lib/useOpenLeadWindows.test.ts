import { describe, expect, it } from "vitest";
import { addWindow, readStored } from "./useOpenLeadWindows";

/**
 * דיווח הרכזות 28.09: חלונות מועמדים נעלמו בכל ניווט, כי כל סינון וחיפוש
 * עושים router.push והמצב חי ב-useState בלבד. הלוגיקה הטהורה נעולה כאן.
 */
describe("addWindow", () => {
  it("פתיחת חלון חדש מוסיפה לסוף", () => {
    expect(addWindow([], "a")).toEqual(["a"]);
    expect(addWindow(["a"], "b")).toEqual(["a", "b"]);
  });

  it("חלון שכבר פתוח לא נפתח פעמיים ולא קופץ למקום אחר", () => {
    const ids = ["a", "b", "c"];
    expect(addWindow(ids, "b")).toBe(ids);
  });

  it("כשהתקרה מלאה הוותיק ביותר נדחק, לא החדש", () => {
    expect(addWindow(["a", "b", "c", "d"], "e")).toEqual(["b", "c", "d", "e"]);
  });

  it("רשימה שחרגה מהתקרה מתכנסת אליה", () => {
    expect(addWindow(["a", "b", "c", "d", "e", "f"], "g")).toEqual(["d", "e", "f", "g"]);
  });
});

describe("readStored", () => {
  it("קורא מה שנשמר", () => {
    expect(readStored('{"ids":["a","b"],"chatFirst":["b"]}')).toEqual({ ids: ["a", "b"], chatFirst: ["b"] });
  });

  it("אחסון ריק, JSON פגום או מבנה זר לא מפילים את העמוד", () => {
    for (const raw of [null, "", "not json", "[]", "{}", '{"ids":"a"}', '{"ids":[1,2]}']) {
      expect(readStored(raw), JSON.stringify(raw)).toEqual({ ids: [], chatFirst: [] });
    }
  });

  it("סימון 'פתח על הצ'אט' של חלון שאינו פתוח נזרק", () => {
    expect(readStored('{"ids":["a"],"chatFirst":["a","ghost"]}')).toEqual({ ids: ["a"], chatFirst: ["a"] });
  });

  it("לא משחזר יותר מהתקרה", () => {
    expect(readStored('{"ids":["a","b","c","d","e","f"],"chatFirst":[]}').ids).toEqual(["a", "b", "c", "d"]);
  });
});
