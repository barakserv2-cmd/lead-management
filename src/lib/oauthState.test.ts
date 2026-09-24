import { beforeAll, describe, expect, it } from "vitest";
import { createOAuthState, verifyOAuthState } from "./oauthState";

/**
 * הקולבק של ג'ימייל קיבל קוד מכל מקור ולא בדק דבר, כך שזר יכול היה לכתוב
 * את הטוקנים שלו לפרודקשן. state חתום הוא מה שמבדיל בין "הזרימה שהתחלנו
 * אנחנו" לבין קוד שתוקף הביא מהחשבון שלו.
 */
const ME = "saar@eilatjobs.com";

describe("OAuth state", () => {
  beforeAll(() => { process.env.OAUTH_STATE_SECRET = "test-secret-for-signing-only"; });

  it("state שנוצר כאן, לאותה כתובת, עובר אימות", () => {
    expect(verifyOAuthState(createOAuthState(ME), ME)).toBe(true);
    // כתובת מייל מכילה נקודות — הקידוד קיים בדיוק כדי שזה לא יישבר
    expect(verifyOAuthState(createOAuthState("a.b.c@sub.domain.co.il"), "A.B.C@Sub.Domain.co.il")).toBe(true);
  });

  it("משתמש אחר לא יכול לפדות state של מישהו אחר", () => {
    expect(verifyOAuthState(createOAuthState(ME), "attacker@evil.com")).toBe(false);
    expect(verifyOAuthState(createOAuthState(ME), "")).toBe(false);
  });

  it("state מזויף, חתוך או ריק נדחה", () => {
    expect(verifyOAuthState(null, ME)).toBe(false);
    expect(verifyOAuthState("", ME)).toBe(false);
    expect(verifyOAuthState("abc", ME)).toBe(false);
    expect(verifyOAuthState("a.b.c.d", ME)).toBe(false);
  });

  it("חתימה שהוחלפה נדחית — זו כל הנקודה", () => {
    const [nonce, issued, email] = createOAuthState(ME).split(".");
    expect(verifyOAuthState(`${nonce}.${issued}.${email}.forged`, ME)).toBe(false);
  });

  it("גוף ששונה אחרי החתימה נדחה", () => {
    const [nonce, issued, , mac] = createOAuthState(ME).split(".");
    const otherEmail = Buffer.from("attacker@evil.com").toString("base64url");
    expect(verifyOAuthState(`${nonce}.${issued}.${otherEmail}.${mac}`, "attacker@evil.com")).toBe(false);
  });

  it("state ישן פג — חלון של עשר דקות", () => {
    const s = createOAuthState(ME);
    expect(verifyOAuthState(s, ME, Date.now() + 9 * 60_000)).toBe(true);
    expect(verifyOAuthState(s, ME, Date.now() + 11 * 60_000)).toBe(false);
  });

  it("חותמת זמן עתידית נדחית", () => {
    expect(verifyOAuthState(createOAuthState(ME), ME, Date.now() - 60_000)).toBe(false);
  });

  it("בלי סוד בשרת — האימות נכשל סגור, לא קורס", () => {
    const good = createOAuthState(ME);
    const keep = {
      st: process.env.OAUTH_STATE_SECRET,
      cron: process.env.CRON_SECRET,
      svc: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    delete process.env.OAUTH_STATE_SECRET;
    delete process.env.CRON_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(verifyOAuthState(good, ME)).toBe(false);
    process.env.OAUTH_STATE_SECRET = keep.st;
    if (keep.cron) process.env.CRON_SECRET = keep.cron;
    if (keep.svc) process.env.SUPABASE_SERVICE_ROLE_KEY = keep.svc;
  });
});
