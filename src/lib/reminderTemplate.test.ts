import { afterEach, describe, expect, it, vi } from "vitest";
import {
  officialReminderAccount,
  sendWhatsAppTemplate,
  type WhatsAppAccount,
} from "./whatsappService";

/**
 * תזכורות הראיון בערוץ הרשמי. 16.09 הן נכשלו בשקט במשך יומיים (0/20)
 * כי יצאו ממספר שנמחק. שלושה דברים נשברים כאן בלי רעש ולכן נבדקים:
 * ברירת מחדל שחוזרת למספר המת, פרמטר ריק שמטא דוחה בשגיאה עמומה,
 * ומבנה הבקשה עצמו.
 */

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
});

const cloud: WhatsAppAccount = {
  instanceId: "cloud:265027330024798",
  token: "",
  provider: "cloud",
  phoneNumberId: "265027330024798",
  tokenEnv: "TEST_CLOUD_TOKEN",
  authStyle: "bearer",
};

describe("officialReminderAccount", () => {
  // בלי הגדרה — null, והקורא נשאר עם ההתנהגות הקודמת. לא מנחשים מספר.
  it("מחזיר null כשהמספר הרשמי לא מוגדר", () => {
    delete process.env.REMINDER_PHONE_NUMBER_ID;
    expect(officialReminderAccount()).toBeNull();
  });

  it("בונה חשבון רשמי מהסביבה, עם הטוקן הראשי כברירת מחדל", () => {
    process.env.REMINDER_PHONE_NUMBER_ID = " 265027330024798 ";
    delete process.env.REMINDER_TOKEN_ENV;
    const acc = officialReminderAccount();
    expect(acc?.provider).toBe("cloud");
    expect(acc?.phoneNumberId).toBe("265027330024798");
    expect(acc?.authStyle).toBe("bearer");
    expect(acc?.tokenEnv).toBe("WHATSAPP_CLOUD_TOKEN_MAIN");
  });
});

describe("sendWhatsAppTemplate", () => {
  const tpl = { name: "interview_reminder_tomorrow", language: "he", params: ["ראיון טלפוני בשעה 12:00"] };

  it("דוחה פרמטר ריק לפני שפונה למטא", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    process.env.TEST_CLOUD_TOKEN = "t";
    const res = await sendWhatsAppTemplate("0501234567", { ...tpl, params: ["  "] }, cloud, { skipGate: true });
    expect(res.success).toBe(false);
    expect(res.error).toContain("פרמטר ריק");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ל-GreenAPI אין תבניות. שליחה משם הייתה הולכת לנתיב הלא נכון בשקט.
  it("מסרב לחשבון GreenAPI", async () => {
    const res = await sendWhatsAppTemplate(
      "0501234567",
      tpl,
      { instanceId: "7103508839", token: "x", provider: "greenapi" },
      { skipGate: true }
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain("ערוץ הרשמי");
  });

  it("נכשל בבירור כשהטוקן חסר בסביבה", async () => {
    delete process.env.TEST_CLOUD_TOKEN;
    const res = await sendWhatsAppTemplate("0501234567", tpl, cloud, { skipGate: true });
    expect(res.success).toBe(false);
    expect(res.error).toContain("TEST_CLOUD_TOKEN");
  });

  it("שולח למטא תבנית במבנה הנכון, עם מספר בינלאומי", async () => {
    process.env.TEST_CLOUD_TOKEN = "secret-token";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.OK" }] }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const res = await sendWhatsAppTemplate("050-123-4567", tpl, cloud, { skipGate: true });

    expect(res).toEqual({ success: true, idMessage: "wamid.OK" });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/265027330024798/messages");
    expect(init.headers.Authorization).toBe("Bearer secret-token");
    const body = JSON.parse(init.body);
    expect(body.to).toBe("972501234567");
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("interview_reminder_tomorrow");
    expect(body.template.language.code).toBe("he");
    expect(body.template.components[0].parameters).toEqual([
      { type: "text", text: "ראיון טלפוני בשעה 12:00" },
    ]);
  });

  it("מעביר את הודעת השגיאה של מטא כמו שהיא", async () => {
    process.env.TEST_CLOUD_TOKEN = "t";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "Template name does not exist in the translation" } }),
      })
    );
    const res = await sendWhatsAppTemplate("0501234567", tpl, cloud, { skipGate: true });
    expect(res.success).toBe(false);
    expect(res.error).toContain("does not exist");
  });
});
