// ============================================================
// /api/publishing/posts — the copy itself.
// A post is one piece of Hebrew ad text, normally built from one of the 7
// role templates and optionally tied to a live job. Its variants (rewrites)
// live in fb_variants and are created by /api/publishing/generate.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { admin, bad, currentUser, unauthorized } from "@/lib/publishingAuth";
import type { PostStatus } from "@/types/publishing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const status = req.nextUrl.searchParams.get("status");
  const roleKey = req.nextUrl.searchParams.get("role_key");

  let query = admin()
    .from("fb_posts")
    .select("*, fb_variants(*)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  else query = query.neq("status", "archived");
  if (roleKey) query = query.eq("role_key", roleKey);

  const { data, error } = await query;
  if (error) return bad(error.message, 500);
  return NextResponse.json({ posts: data ?? [] });
}

interface PostBody {
  id?: string;
  role_key?: string | null;
  job_id?: string | null;
  title?: string;
  body?: string;
  angle?: string | null;
  status?: PostStatus;
  variants?: { body: string; label?: string | null }[];
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const b = (await req.json()) as PostBody;
  if (!b.title?.trim()) return bad("חסרה כותרת לפוסט");
  if (!b.body?.trim()) return bad("חסר תוכן לפוסט");

  const db = admin();
  const { data: post, error } = await db
    .from("fb_posts")
    .insert({
      role_key: b.role_key ?? null,
      job_id: b.job_id ?? null,
      title: b.title.trim(),
      body: b.body.trim(),
      angle: b.angle?.trim() || null,
      status: b.status ?? "ready",
      created_by: user.email,
    })
    .select()
    .single();
  if (error) return bad(error.message, 500);

  if (b.variants?.length) {
    const { error: vErr } = await db.from("fb_variants").insert(
      b.variants
        .filter((v) => v.body?.trim())
        .map((v) => ({ post_id: post.id, body: v.body.trim(), label: v.label ?? null }))
    );
    if (vErr) return bad(vErr.message, 500);
  }

  const { data: full } = await db
    .from("fb_posts")
    .select("*, fb_variants(*)")
    .eq("id", post.id)
    .single();

  return NextResponse.json({ post: full ?? post });
}

export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const { id, variants, ...patch } = (await req.json()) as PostBody;
  if (!id) return bad("חסר מזהה פוסט");

  const db = admin();
  const { data, error } = await db
    .from("fb_posts")
    .update(patch)
    .eq("id", id)
    .select("*, fb_variants(*)")
    .maybeSingle();
  if (error) return bad(error.message, 500);
  if (!data) return bad("הפוסט לא נמצא", 404);

  // `variants` on PATCH means "add these", never "replace" — a variant that
  // was already published must stay resolvable from fb_publications.
  if (variants?.length) {
    await db.from("fb_variants").insert(
      variants
        .filter((v) => v.body?.trim())
        .map((v) => ({ post_id: id, body: v.body.trim(), label: v.label ?? null }))
    );
  }

  return NextResponse.json({ post: data });
}

export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return bad("חסר מזהה פוסט");

  // Archive rather than delete: publications keep pointing at their post.
  const { error } = await admin().from("fb_posts").update({ status: "archived" }).eq("id", id);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
