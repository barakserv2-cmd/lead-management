// ============================================================
// Organic Facebook-groups publishing — shared helpers.
//
// Facebook has no Groups publishing API any more (publish_to_groups was
// deprecated in April 2024), so the CRM never posts by itself. Each recruiter
// posts from her own logged-in Facebook profile, in the groups she is a member
// of. Everything here supports that manual act: cooldown bookkeeping, copy
// composition, and a per-publication tracking code that ties a candidate back
// to the exact group she came from.
// ============================================================

import type { FbGroup, GroupWithStats } from "@/types/publishing";

// ── Tracking codes ──────────────────────────────────────────
// Short, unambiguous, easy to type in a WhatsApp message.
// Skips 0/O/1/I/L so a candidate re-typing the code can't get it wrong.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateTrackingCode(): string {
  let out = "";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `BK-${out}`;
}

/** Finds the tracking code inside an inbound WhatsApp message, if any. */
export function extractTrackingCode(text: string): string | null {
  const m = text.match(/BK-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}/i);
  return m ? m[0].toUpperCase() : null;
}

// ── Contact link ────────────────────────────────────────────

/** 05X-XXXXXXX → 9725XXXXXXXX (wa.me wants digits only, no +). */
export function waNumber(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return `972${d.slice(1)}`;
  return d;
}

/**
 * The CTA link that goes into the post. The prefilled text carries the
 * tracking code, so the code shows up in the recruiter's WhatsApp the moment
 * the candidate hits send — no UTM, no landing page in between.
 */
export function buildWaLink(
  phone: string | null | undefined,
  code: string
): string | null {
  if (!phone) return null;
  // The prefill is JUST the tracking code, kept ASCII on purpose. Any Hebrew in
  // the prefill percent-encodes into a long %D7%..%D7%.. blob that fills the
  // post, reads as spam in a group, and gives away that the post is automated.
  // "BK-XXXX" is URL-safe as-is, so the link stays short and human-looking; the
  // candidate types their own message around it and the code still arrives.
  return `https://wa.me/${waNumber(phone)}?text=${code}`;
}

// ── Copy composition ────────────────────────────────────────

export interface PostVars {
  role?: string;
  employer?: string;
  location?: string;
  pay?: string;
  start?: string;
  contact?: string;
  link?: string;
  code?: string;
}

/** Fills {{placeholders}}; unknown keys are left untouched so nothing vanishes silently. */
export function fillPlaceholders(body: string, vars: PostVars): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => {
    const v = vars[key as keyof PostVars];
    return v === undefined || v === null || v === "" ? whole : String(v);
  });
}

/** Appends the CTA + tracking code exactly once. */
export function withCta(body: string, link: string | null, signature?: string | null): string {
  const parts = [body.trim()];
  if (signature?.trim()) parts.push(signature.trim());
  // One clean CTA line, appended after the copy's own closing sentence. The
  // tracking code rides invisibly inside the wa.me prefill, so there is no
  // robotic "קוד משרה:" line any more — that line, plus the huge encoded URL,
  // were what made the post look machine-generated.
  if (link && !body.includes(link)) {
    parts.push(`👇 שליחת הודעה בוואטסאפ:\n${link}`);
  }
  return parts.join("\n\n");
}

// ── Cooldown ────────────────────────────────────────────────

/**
 * When may we post in this group again? Job groups ban members for
 * re-posting too often, so the queue blocks a group until its own
 * cooldown_hours have passed since our last post there.
 */
export function cooldownUntil(
  group: Pick<FbGroup, "cooldown_hours">,
  lastPostedAt: string | null
): string | null {
  if (!lastPostedAt) return null;
  const until = new Date(lastPostedAt).getTime() + group.cooldown_hours * 3600_000;
  return until > Date.now() ? new Date(until).toISOString() : null;
}

export function isAvailable(group: GroupWithStats): boolean {
  return group.is_active && !group.cooldown_until;
}

/** "עוד 3 שעות" / "עוד 40 דק׳" — for the group card. */
export function cooldownLabel(cooldownUntilIso: string | null): string | null {
  if (!cooldownUntilIso) return null;
  const ms = new Date(cooldownUntilIso).getTime() - Date.now();
  if (ms <= 0) return null;
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `עוד ${mins} דק׳`;
  const hours = Math.round(mins / 60);
  return `עוד ${hours} שע׳`;
}

// ── Anti-duplicate ──────────────────────────────────────────

/**
 * Rough similarity between two posts (shared word ratio). Facebook demotes or
 * blocks copy pasted verbatim across groups, so the queue warns when a variant
 * is too close to what already went out on the same day.
 */
export function similarity(a: string, b: string): number {
  const words = (s: string) =>
    new Set(
      s
        .replace(/https?:\/\/\S+/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  const A = words(a);
  const B = words(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.max(A.size, B.size);
}

export const DUPLICATE_THRESHOLD = 0.8;
