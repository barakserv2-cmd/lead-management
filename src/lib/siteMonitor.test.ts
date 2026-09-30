import { describe, expect, it } from "vitest";
import { checkFormScripts, expectedTouches, parseScripts, SITE_FORM_SUBJECT_RE } from "./siteMonitor";

const P = "https://www.eilatjobs.com/wp-content/plugins";
const form = `<form class="elementor-form" name="job-form"></form>`;

// הצורה של ה-HTML ב-29.09: הבסיס נדחה (defer), פרו לא — פרו רץ ראשון.
const broken = `
<script defer src="${P}/elementor/assets/js/webpack.runtime.min.js?ver=4.2.3"></script>
<script defer src="${P}/elementor/assets/js/frontend-modules.min.js?ver=4.2.3"></script>
<script defer src="${P}/elementor/assets/js/frontend.min.js?ver=4.2.3"></script>
${form}
<script src="${P}/elementor-pro/assets/js/webpack-pro.runtime.min.js?ver=4.2.2"></script>
<script src="${P}/elementor-pro/assets/js/frontend.min.js?ver=4.2.2"></script>`;

// אחרי התיקון (30.09): שניהם רגילים, הבסיס קודם.
const fixed = broken.replace(/<script defer /g, "<script ");

describe("checkFormScripts", () => {
  it("catches the 29.09 outage: Pro runs before the deferred core", () => {
    expect(checkFormScripts(broken)).toMatch(/לפני קוד הבסיס/);
  });

  it("passes the fixed page", () => {
    expect(checkFormScripts(fixed)).toBeNull();
  });

  it("passes when both are deferred in the right order", () => {
    const bothDeferred = broken.replace(/<script src=/g, "<script defer src=");
    expect(checkFormScripts(bothDeferred)).toBeNull();
  });

  it("treats WP Rocket 'delay JS' as running last", () => {
    const delayedCore = fixed.replace(
      `<script src="${P}/elementor/assets/js/frontend-modules.min.js?ver=4.2.3">`,
      `<script type="rocketlazyloadscript" data-rocket-src="${P}/elementor/assets/js/frontend-modules.min.js?ver=4.2.3">`
    );
    expect(checkFormScripts(delayedCore)).toMatch(/לפני קוד הבסיס/);
  });

  it("flags a page with a form but no Pro script", () => {
    const noPro = fixed.replace(/<script src="[^"]*elementor-pro[^"]*"><\/script>/g, "");
    expect(checkFormScripts(noPro)).toMatch(/פרו לא נטען/);
  });

  it("ignores pages without a form", () => {
    expect(checkFormScripts(broken.replace(form, ""))).toBeNull();
  });
});

describe("parseScripts", () => {
  it("reads defer, async and delayed phases", () => {
    const tags = parseScripts(
      `<script src="a.js"></script><script defer src="b.js"></script>` +
        `<script async src="c.js"></script><script type="rocketlazyloadscript" data-rocket-src="d.js"></script><script>inline()</script>`
    );
    expect(tags.map((t) => [t.src, t.phase])).toEqual([
      ["a.js", 1],
      ["b.js", 2],
      ["c.js", 2],
      ["d.js", 3],
    ]);
  });
});

describe("expectedTouches", () => {
  it("sums the per-hour average over the silent window", () => {
    // 14 יום, פנייה אחת בכל יום ב-10:00 וב-11:00 שעון ישראל (07/08 UTC בשעון קיץ)
    const history: string[] = [];
    for (let d = 1; d <= 14; d++) {
      const day = String(d).padStart(2, "0");
      history.push(`2026-09-${day}T07:15:00Z`, `2026-09-${day}T08:15:00Z`);
    }
    // 09:00–12:00 ישראל = שתי השעות הפעילות → מצופות 2 פניות
    const e = expectedTouches(history, new Date("2026-09-20T06:00:00Z"), new Date("2026-09-20T09:00:00Z"), 14);
    expect(e).toBeCloseTo(2, 5);
  });
});

describe("SITE_FORM_SUBJECT_RE", () => {
  it("matches every site form subject and nothing else", () => {
    for (const s of [
      "ליד חדש משרה באתר",
      "ליד חדש - עמוד ראשי מהאתר",
      "ליד מהאתר טופס תחתון - ברק שירותים",
      "ליד חדש בדף נחיתה- עבודה באילת כולל מגורים",
      "Новый лид - главная страница с сайта",
    ]) {
      expect(SITE_FORM_SUBJECT_RE.test(s)).toBe(true);
    }
    expect(SITE_FORM_SUBJECT_RE.test("שיחה חדשה מהמספרים הוירטואלים מסקיו")).toBe(false);
    expect(SITE_FORM_SUBJECT_RE.test("ליד חדש הגיע מהצ׳אט באתר!")).toBe(false);
  });
});
