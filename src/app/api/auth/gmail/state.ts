import { timingSafeEqual } from "crypto";

export const GMAIL_STATE_COOKIE = "gmail_oauth_state";

/** Constant-time comparison of the OAuth `state` echoed by Google with the cookie we set. */
export function stateMatches(fromGoogle: string | null, fromCookie: string | undefined): boolean {
  if (!fromGoogle || !fromCookie) return false;
  const a = Buffer.from(fromGoogle);
  const b = Buffer.from(fromCookie);
  return a.length === b.length && timingSafeEqual(a, b);
}
