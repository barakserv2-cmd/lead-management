// ============================================================
// /api/publishing/groups — the recruiter's Facebook-group inventory.
//
// A group row belongs to the recruiter who is a member of it (owner_email).
// A recruiter sees her own groups; an admin sees everyone's (?scope=all).
// GET also computes the live cooldown state the queue runs on.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { admin, bad, currentUser, unauthorized } from "@/lib/publishingAuth";
import { cooldownUntil } from "@/lib/publishing";
import type { FbGroup, GroupWithStats } from "@/types/publishing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const scopeAll = req.nextUrl.searchParams.get("scope") === "all" && user.isAdmin;
  const db = admin();

  let query = db.from("fb_groups").select("*").order("name", { ascending: true });
  if (!scopeAll) query = query.eq("owner_email", user.email);

  const { data, error } = await query;
  if (error) return bad(error.message, 500);

  const groups = (data ?? []) as FbGroup[];
  if (groups.length === 0) return NextResponse.json({ groups: [] });

  // One pass over this group set's publications → last post, volume, responses.
  const { data: pubs, error: pubErr } = await db
    .from("fb_publications")
    .select("group_id, posted_at, responses, status")
    .in("group_id", groups.map((g) => g.id))
    .eq("status", "posted");
  if (pubErr) return bad(pubErr.message, 500);

  const stats = new Map<string, { last: string | null; count: number; responses: number }>();
  for (const p of pubs ?? []) {
    const row = stats.get(p.group_id) ?? { last: null, count: 0, responses: 0 };
    row.count += 1;
    row.responses += p.responses ?? 0;
    if (p.posted_at && (!row.last || p.posted_at > row.last)) row.last = p.posted_at;
    stats.set(p.group_id, row);
  }

  const withStats: GroupWithStats[] = groups.map((g) => {
    const s = stats.get(g.id);
    return {
      ...g,
      last_posted_at: s?.last ?? null,
      posts_count: s?.count ?? 0,
      responses_total: s?.responses ?? 0,
      cooldown_until: cooldownUntil(g, s?.last ?? null),
    };
  });

  return NextResponse.json({ groups: withStats });
}

interface GroupBody {
  id?: string;
  name?: string;
  url?: string;
  members?: number | null;
  category?: string | null;
  cooldown_hours?: number;
  rules?: string | null;
  requires_approval?: boolean;
  is_active?: boolean;
}

function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return url;
  return url.startsWith("http") ? url : `https://${url}`;
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as GroupBody | { groups: GroupBody[] };
  const items = "groups" in body ? body.groups : [body];

  const rows = [];
  for (const g of items) {
    if (!g.name?.trim()) return bad("חסר שם קבוצה");
    if (!g.url?.trim()) return bad("חסר קישור לקבוצה");
    rows.push({
      owner_email: user.email,
      name: g.name.trim(),
      url: normalizeUrl(g.url),
      members: g.members ?? null,
      category: g.category?.trim() || null,
      cooldown_hours: g.cooldown_hours ?? 24,
      rules: g.rules?.trim() || null,
      requires_approval: g.requires_approval ?? false,
      is_active: g.is_active ?? true,
    });
  }

  const { data, error } = await admin()
    .from("fb_groups")
    .upsert(rows, { onConflict: "owner_email,url" })
    .select();
  if (error) return bad(error.message, 500);

  return NextResponse.json({ groups: data });
}

export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const { id, ...patch } = (await req.json()) as GroupBody;
  if (!id) return bad("חסר מזהה קבוצה");
  if (patch.url) patch.url = normalizeUrl(patch.url);

  let query = admin().from("fb_groups").update(patch).eq("id", id);
  if (!user.isAdmin) query = query.eq("owner_email", user.email);

  const { data, error } = await query.select().maybeSingle();
  if (error) return bad(error.message, 500);
  if (!data) return bad("הקבוצה לא נמצאה או שאינה שלך", 404);

  return NextResponse.json({ group: data });
}

export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return bad("חסר מזהה קבוצה");

  let query = admin().from("fb_groups").delete().eq("id", id);
  if (!user.isAdmin) query = query.eq("owner_email", user.email);

  const { error } = await query;
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
