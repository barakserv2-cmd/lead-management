import { describe, expect, it } from "vitest";
import { classifyLead, readAdParams } from "./leadChannel";

describe("classifyLead — calls", () => {
  it("a Maskyoo number decides the channel, whatever the source says", () => {
    expect(classifyLead({ source: "טלפון", source_number: "0738021099" })).toEqual({ channel: "גוגל ממומן", method: "שיחה", campaign: null });
    expect(classifyLead({ source: "טלפון", source_number: "073-802-0145" }).channel).toBe("גוגל אורגני");
    expect(classifyLead({ source: "אחר", source_number: "0554328284", manual: true }).channel).toBe("פייסבוק אורגני");
  });

  it("a call without a tracking number is unknown, not a channel", () => {
    expect(classifyLead({ source: "טלפון", manual: true })).toEqual({ channel: "לא ידוע", method: "שיחה", campaign: null });
  });
});

describe("classifyLead — forms", () => {
  it("reads the ad code from an Elementor field", () => {
    const body = "name: דנה\nutm_source: google utm_medium: cpc utm_campaign: search_eilat_phrase utm_term: דרושים";
    expect(classifyLead({ source: "אתר - עמוד ראשי", original_email_body: body })).toEqual({
      channel: "גוגל ממומן", method: "טופס", campaign: "search_eilat_phrase",
    });
  });

  it("reads the ad code from the landing-page link — 220 leads were never tagged", () => {
    const body = "source: דף נחיתה עבודה מועדפת\nקישור לעמוד: https://www.eilatjobs.com/avoda-muadefet-eilat/?utm_source=google&utm_medium=cpc&utm_campaign=search_eilat_young&gclid=Cj0K";
    expect(classifyLead({ source: "דף נחיתה", original_email_subject: "ליד חדש בדף נחיתה - עבודה מעודפת כולל מגורים", original_email_body: body }))
      .toEqual({ channel: "גוגל ממומן", method: "טופס", campaign: "search_eilat_young" });
  });

  it("an empty utm field is not a value", () => {
    expect(readAdParams("cf-utm_source: cf-utm_medium: cf-utm_campaign:").source).toBeNull();
  });

  it("a site form without an ad code is organic or direct", () => {
    expect(classifyLead({ source: "אתר - טופס משרה", original_email_subject: "ליד חדש משרה באתר", original_email_body: "name: x\ncf-utm_source: " }))
      .toEqual({ channel: "אתר (אורגני/ישיר)", method: "טופס", campaign: null });
  });

  it("an Unbounce page keeps its name as the campaign, origin unknown", () => {
    expect(classifyLead({ source: "דף נחיתה", original_email_subject: "[New Lead] Page: דרושים באילת", original_email_body: "Page Name: דרושים באילת" }))
      .toEqual({ channel: "לא ידוע", method: "טופס", campaign: "דרושים באילת" });
  });

  it("ChatGPT referrals are their own channel", () => {
    expect(classifyLead({ source: "אתר - עמוד ראשי", original_email_body: "utm_source: chatgpt.com" }).channel).toBe("צ'אט GPT");
  });

  it("site chat is a chat", () => {
    expect(classifyLead({ source: "צ'אט באתר", original_email_subject: "ליד חדש הגיע מהצ׳אט באתר!" }))
      .toEqual({ channel: "אתר (אורגני/ישיר)", method: "צ'אט", campaign: null });
  });
});

describe("classifyLead — boards and Facebook", () => {
  it("Facebook lead ads keep the campaign name", () => {
    expect(classifyLead({ source: "פייסבוק - BARAK", original_email_subject: "x" })).toEqual({ channel: "פייסבוק ממומן", method: "טופס", campaign: "BARAK" });
  });

  it("a Facebook group post is not a Facebook ad", () => {
    expect(classifyLead({ source: "פייסבוק אורגני - דרושים באילת", manual: true })).toEqual({ channel: "קבוצות פייסבוק", method: "וואטסאפ", campaign: "דרושים באילת" });
  });

  it("job boards", () => {
    expect(classifyLead({ source: "AllJobs", original_email_subject: "מועמדות חדשה" }).channel).toBe("AllJobs");
    expect(classifyLead({ source: 'פק"ש', original_email_subject: "1253" }).method).toBe("מועמדות בלוח");
  });

  it("direct WhatsApp without a clue is unknown", () => {
    expect(classifyLead({ source: "וואטסאפ", manual: true })).toEqual({ channel: "לא ידוע", method: "וואטסאפ", campaign: null });
  });

  it("'other' is never a channel", () => {
    expect(classifyLead({ source: "אחר", manual: true }).channel).toBe("לא ידוע");
  });
});

describe("classifyLead — first contact wins", () => {
  it("a Facebook ad lead who later called the organic number stays Facebook", () => {
    expect(classifyLead({ source: "פייסבוק - BARAK", source_number: "0738020145", original_email_subject: "x" }).channel).toBe("פייסבוק ממומן");
  });
  it("a WhatsApp lead with a tracking number takes the number's channel", () => {
    expect(classifyLead({ source: "וואטסאפ", source_number: "0738021099", manual: true })).toEqual({ channel: "גוגל ממומן", method: "וואטסאפ", campaign: null });
  });
});
