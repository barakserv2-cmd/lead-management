// ============================================================
// /api/publishing/publications — the posting queue.
//
// One row per (post, group). Creating rows is the "distribute" step: each
// selected group gets its OWN variant of the copy and its OWN tracking code,
// because identical text pasted into several groups is exactly what Facebook
// scores as spam. Marking a row posted is what starts that group's cooldown.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { admin, bad, currentUser, unauthorized } from "@/lib/publishingAuth";
import {
  buildWaLink,
  composeBody,
  composeComment,
  cooldownUntil,
  fillPlaceholders,
  generateTrackingCode,
} from "@/lib/publishing";
import type { FbGroup, FbVariant, PublicationStatus } from "@/types/publishing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const params = req.nextUrl.searchParams;
  const status = params.get("status");
  const scopeAll = params.get("scope") === "all" && user.isAdmin;

  let query = admin()
    .from("fb_publications")
    .select(
      "*, fb_groups(id, name, url, cooldown_hours, rules, requires_approval), fb_posts(id, title, role_key)"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (status) query = query.in("status", status.split(","));
  if (!scopeAll) query = query.eq("owner_email", user.email);

  const { data, error } = await query;
  if (error) return bad(error.message, 500);
  return NextResponse.json({ publications: data ?? [] });
}

interface DistributeBody {
  post_id: string;
  group_ids: string[];
  /** ISO time; null/absent = post now */
  scheduled_for?: string | null;
  /** post into groups that are still inside their cooldown */
  force?: boolean;
  /** overrides for {{placeholders}} in the copy */
  vars?: Record<string, string>;
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const b = (await req.json()) as DistributeBody;
  if (!b.post_id) return bad("חסר מזהה פוסט");
  if (!b.group_ids?.length) return bad("לא נבחרו קבוצות");

  const db = admin();

  const [{ data: post, error: postErr }, { data: settings }, { data: groupRows, error: gErr }] =
    await Promise.all([
      db.from("fb_posts").select("*, fb_variants(*)").eq("id", b.post_id).maybeSingle(),
      db.from("publishing_settings").select("*").eq("id", 1).maybeSingle(),
      db.from("fb_groups").select("*").in("id", b.group_ids),
    ]);

  if (postErr) return bad(postErr.message, 500);
  if (!post) return bad("הפוסט לא נמצא", 404);
  if (gErr) return bad(gErr.message, 500);

  const groups = (groupRows ?? []) as FbGroup[];
  const mine = user.isAdmin ? groups : groups.filter((g) => g.owner_email === user.email);
  if (mine.length === 0) return bad("אין קבוצות שלך בבחירה");

  // The CTA points at the phone of the recruiter who OWNS the group, because
  // she is the one who will post there and answer whoever writes back. Only if
  // she has no linked WhatsApp number do we fall back to the agency default.
  const owners = [...new Set(mine.map((g) => g.owner_email))];
  const { data: accounts } = await db
    .from("whatsapp_accounts")
    .select("user_email, phone")
    .in("user_email", owners)
    .eq("is_active", true);

  const phoneByOwner = new Map<string, string>();
  for (const a of accounts ?? []) {
    if (a.phone) phoneByOwner.set(a.user_email, a.phone as string);
  }

  // Cooldown check — one query for the whole batch.
  const { data: lastPosts } = await db
    .from("fb_publications")
    .select("group_id, posted_at")
    .in("group_id", mine.map((g) => g.id))
    .eq("status", "posted")
    .order("posted_at", { ascending: false });

  const lastByGroup = new Map<string, string>();
  for (const p of lastPosts ?? []) {
    if (p.posted_at && !lastByGroup.has(p.group_id)) lastByGroup.set(p.group_id, p.posted_at);
  }

  // Round-robin the base copy + every variant, so consecutive groups never get
  // the same text.
  const variants = (post.fb_variants ?? []) as FbVariant[];
  const bodies: { body: string; variant_id: string | null }[] = [
    { body: post.body, variant_id: null },
    ...variants.map((v) => ({ body: v.body, variant_id: v.id })),
  ];

  const rows = [];
  const blocked: { name: string; until: string }[] = [];

  let i = 0;
  for (const g of mine) {
    const until = cooldownUntil(g, lastByGroup.get(g.id) ?? null);
    if (until && !b.force) {
      blocked.push({ name: g.name, until });
      continue;
    }

    const code = generateTrackingCode();
    const pick = bodies[i % bodies.length];
    i++;

    const phone = phoneByOwner.get(g.owner_email) ?? settings?.contact_phone ?? null;
    const link = buildWaLink(phone, code);
    const filled = fillPlaceholders(pick.body, {
      ...(b.vars ?? {}),
      code,
      link: link ?? undefined,
      contact: phone ?? undefined,
    });

    rows.push({
      post_id: post.id,
      group_id: g.id,
      variant_id: pick.variant_id,
      owner_email: g.owner_email,
      body_snapshot: composeBody(filled, !!link, settings?.signature ?? null),
      comment_snapshot: link ? composeComment(link) : null,
      tracking_code: code,
      status: "queued" as const,
      scheduled_for: b.scheduled_for ?? null,
      created_by: user.email,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ publications: [], blocked }, { status: 200 });
  }

  const { data, error } = await db
    .from("fb_publications")
    .insert(rows)
    .select("*, fb_groups(id, name, url, cooldown_hours, rules, requires_approval), fb_posts(id, title, role_key)");
  if (error) return bad(error.message, 500);

  return NextResponse.json({ publications: data ?? [], blocked });
}

interface PublicationPatch {
  id: string;
  status?: PublicationStatus;
  post_url?: string | null;
  responses?: number;
  notes?: string | null;
  body_snapshot?: string;
  scheduled_for?: string | null;
}

export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const { id, ...patch } = (await req.json()) as PublicationPatch;
  if (!id) return bad("חסר מזהה פרסום");

  const update: Record<string, unknown> = { ...patch };
  // Going to "posted" is what starts the group's cooldown, so stamp the time
  // here rather than trusting the client clock.
  if (patch.status === "posted") update.posted_at = new Date().toISOString();
  if (patch.status === "queued") update.posted_at = null;

  let query = admin().from("fb_publications").update(update).eq("id", id);
  if (!user.isAdmin) query = query.eq("owner_email", user.email);

  const { data, error } = await query
    .select("*, fb_groups(id, name, url, cooldown_hours, rules, requires_approval), fb_posts(id, title, role_key)")
    .maybeSingle();
  if (error) return bad(error.message, 500);
  if (!data) return bad("הפרסום לא נמצא או שאינו שלך", 404);

  // Using a variant is worth counting — it drives which text to rotate next.
  if (patch.status === "posted" && data.variant_id) {
    await admin().rpc("increment_variant_use", { v_id: data.variant_id });
  }

  return NextResponse.json({ publication: data });
}

export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return bad("חסר מזהה פרסום");

  let query = admin().from("fb_publications").delete().eq("id", id).eq("status", "queued");
  if (!user.isAdmin) query = query.eq("owner_email", user.email);

  const { error } = await query;
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
