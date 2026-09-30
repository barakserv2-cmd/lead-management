import { describe, expect, it, vi } from "vitest";
import { addWindow, parseState, MAX_WINDOWS } from "./leadWindows";

/**
 * דיווח הרכזות (28.09): "נכנסת שיחה והיא חייבת לצאת מהכל ולהתחיל מהתחלה".
 * החלונות חיו ב-useState של עמוד הלידים, וכל חיפוש עושה router.push —
 * כלומר הרכבה מחדש ומחיקת הכל. הלוגיקה הטהורה של החנות המשותפת נעולה כאן.
 */
describe("addWindow", () => {
  it("פתיחה מוסיפה לסוף", () => {
    expect(addWindow([], "a")).toEqual(["a"]);
    expect(addWindow(["a"], "b")).toEqual(["a", "b"]);
  });

  it("חלון פתוח לא נפתח פעמיים ולא קופץ למקום אחר", () => {
    const ids = ["a", "b", "c"];
    expect(addWindow(ids, "b")).toBe(ids);
  });

  it("בתקרה הוותיק נדחק, לא החדש", () => {
    expect(addWindow(["a", "b", "c", "d"], "e")).toEqual(["b", "c", "d", "e"]);
  });

  it("רשימה שחרגה מהתקרה מתכנסת אליה", () => {
    expect(addWindow(["a", "b", "c", "d", "e", "f"], "g")).toEqual(["d", "e", "f", "g"]);
    expect(addWindow(["a", "b", "c", "d", "e", "f"], "g").length).toBe(MAX_WINDOWS);
  });
});

describe("parseState", () => {
  it("קורא מה שנשמר", () => {
    expect(parseState('{"ids":["a","b"],"chatFirst":["b"]}')).toEqual({ ids: ["a", "b"], chatFirst: ["b"] });
  });

  it("אחסון ריק, JSON פגום או מבנה זר לא מפילים את המערכת", () => {
    for (const raw of [null, "", "not json", "[]", "{}", '{"ids":"a"}', '{"ids":[1,2]}', '{"ids":null}']) {
      expect(parseState(raw), JSON.stringify(raw)).toEqual({ ids: [], chatFirst: [] });
    }
  });

  it("סימון 'פתח על הצ'אט' של חלון שאינו פתוח נזרק", () => {
    expect(parseState('{"ids":["a"],"chatFirst":["a","ghost"]}')).toEqual({ ids: ["a"], chatFirst: ["a"] });
  });

  it("לא משחזר יותר מהתקרה — אחרת יום שלם של עבודה חוזר כערימה", () => {
    expect(parseState('{"ids":["a","b","c","d","e","f"],"chatFirst":[]}').ids).toHaveLength(MAX_WINDOWS);
  });
});

/**
 * הלב של התיקון הוא מחזור השחזור/שמירה מול sessionStorage — זה מה שגורם
 * לחלונות לשרוד ניווט. נבדק מקצה לקצה עם אחסון מדומה, כי זה החלק שנשבר
 * בשקט: רינדור ראשון ריק שדורס את מה שנשמר.
 */
describe("מחזור שמירה ושחזור", () => {
  function fakeStorage(initial?: string) {
    const store = new Map<string, string>();
    if (initial !== undefined) store.set("leadWindows:v1", initial);
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      raw: store,
    };
  }

  async function freshModule(initial?: string) {
    const storage = fakeStorage(initial);
    // @ts-expect-error — מדמים דפדפן בסביבת node
    globalThis.window = { sessionStorage: storage };
    vi.resetModules();
    const mod = await import("./leadWindows");
    return { mod, storage };
  }

  it("חלונות שנשמרו לפני ניווט חוזרים אחריו", async () => {
    const { mod } = await freshModule('{"ids":["a","b"],"chatFirst":["b"]}');
    expect(mod.useLeadWindows === undefined).toBe(false);
    mod.openLeadWindow("c");
    // השחזור קרה לפני ההוספה — אחרת "a" ו-"b" היו נמחקים
    expect(JSON.parse(String((globalThis.window as unknown as { sessionStorage: { getItem(k: string): string } }).sessionStorage.getItem("leadWindows:v1"))).ids)
      .toEqual(["a", "b", "c"]);
  });

  it("סגירה נשמרת, ומנקה גם את סימון הצ'אט", async () => {
    const { mod, storage } = await freshModule('{"ids":["a","b"],"chatFirst":["b"]}');
    mod.closeLeadWindow("b");
    const saved = JSON.parse(String(storage.getItem("leadWindows:v1")));
    expect(saved).toEqual({ ids: ["a"], chatFirst: [] });
  });

  it("אחסון שזורק שגיאה לא מפיל את המערכת", async () => {
    const throwing = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
    };
    // @ts-expect-error — מדמים דפדפן שחוסם אחסון (גלישה פרטית)
    globalThis.window = { sessionStorage: throwing };
    vi.resetModules();
    const mod = await import("./leadWindows");
    expect(() => mod.openLeadWindow("a")).not.toThrow();
    expect(() => mod.closeLeadWindow("a")).not.toThrow();
  });
});

/**
 * סער, 28.09: "תוך כדי רושם הערה ונכנסת לי שיחה — זה יוצא ממנה".
 * הפולר של ההודעות הנכנסות פתח חלון בעצמו באמצע הקלדה וגרר את הרכזת
 * החוצה ממה שעשתה; וכשהרציף מלא, הפתיחה האוטומטית דחקה החוצה בדיוק את
 * החלון שכתבו בו. פתיחה יזומה של המערכת נסוגה; פתיחה של אדם — לעולם לא.
 */
describe("פתיחה אוטומטית לא חוטפת את המסך", () => {
  async function withFocus(tagName: string | null) {
    // מדמים דפדפן בסביבת node — רק החלקים שהמודול נוגע בהם
    const g = globalThis as unknown as { window: unknown; document: unknown };
    g.window = { sessionStorage: { getItem: () => null, setItem: () => {} } };
    g.document = {
      activeElement: tagName ? { tagName, isContentEditable: false } : null,
    };
    vi.resetModules();
    return await import("./leadWindows");
  }

  it("מישהו מקליד → הודעה נכנסת לא פותחת חלון", async () => {
    const mod = await withFocus("TEXTAREA");
    expect(mod.openLeadWindow("a", { auto: true })).toBe(false);
  });

  it("גם שדה טקסט רגיל ובחירה נחשבים הקלדה", async () => {
    for (const tag of ["INPUT", "SELECT"]) {
      const mod = await withFocus(tag);
      expect(mod.openLeadWindow("a", { auto: true }), tag).toBe(false);
    }
  });

  it("אף אחד לא מקליד → נפתח כרגיל", async () => {
    const mod = await withFocus(null);
    expect(mod.openLeadWindow("a", { auto: true })).toBe(true);
  });

  it("פתיחה של אדם עוברת גם באמצע הקלדה — זו בחירה שלו", async () => {
    const mod = await withFocus("TEXTAREA");
    expect(mod.openLeadWindow("a")).toBe(true);
  });

  it("רציף מלא → פתיחה אוטומטית נסוגה ולא דוחקת חלון שעובדים בו", async () => {
    const mod = await withFocus(null);
    for (const id of ["a", "b", "c", "d"]) mod.openLeadWindow(id);
    expect(mod.openLeadWindow("e", { auto: true })).toBe(false);
    expect(mod.openLeadWindow("a", { auto: true })).toBe(true);
  });
});
