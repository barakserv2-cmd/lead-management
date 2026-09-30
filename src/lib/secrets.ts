// Shared-secret checks for the machine-to-machine routes (Vercel cron, the
// גובגט bridge, the legacy API key, the GreenAPI webhook).
//
// Two rules the per-route copies used to break:
//   1. Fail closed. `if (!secret) return true` meant that one missing or
//      renamed env var in Vercel made the retention (anonymize/delete),
//      reminder and scheduled-send crons public.
//   2. Compare in constant time, so the secret can't be guessed byte by byte
//      from response timing.

import { timingSafeEqual } from "crypto";

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. Without the env
 * var only local development is let through; production refuses.
 */
export function hasCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

/** גובגט → v1: `x-machine-key` must equal MACHINE_BRIDGE_KEY (never passes when unset). */
export function hasMachineKey(req: Request): boolean {
  const secret = process.env.MACHINE_BRIDGE_KEY;
  const key = req.headers.get("x-machine-key");
  return !!secret && !!key && safeEqual(key, secret);
}
