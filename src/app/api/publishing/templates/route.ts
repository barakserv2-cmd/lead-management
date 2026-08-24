// /api/publishing/templates — the 7 recurring roles Barak posts for.
// Shared by the whole agency: editing a template changes the starting point
// for every recruiter, so it stays a small, deliberate surface (headline,
// default copy, requirements, on/off).

import { NextRequest, NextResponse } from "next/server";
import { admin, bad, currentUser, unauthorized } from "@/lib/publishingAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();

  const { data, error } = await admin()
    .from("fb_role_templates")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return bad(error.message, 500);
  return NextResponse.json({ templates: data ?? [] });
}

interface TemplateBody {
  id?: string;
  role_key?: string;
  role_label?: string;
  emoji?: string | null;
  headline?: string | null;
  body?: string | null;
  requirements?: string[];
  is_active?: boolean;
  sort_order?: number;
}

export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const { id, ...patch } = (await req.json()) as TemplateBody;
  if (!id) return bad("חסר מזהה תבנית");

  const { data, error } = await admin()
    .from("fb_role_templates")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) return bad(error.message, 500);
  if (!data) return bad("התבנית לא נמצאה", 404);
  return NextResponse.json({ template: data });
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return bad("רק אדמין יכול/ה להוסיף תפקיד", 403);

  const b = (await req.json()) as TemplateBody;
  if (!b.role_key?.trim()) return bad("חסר מזהה תפקיד");
  if (!b.role_label?.trim()) return bad("חסר שם תפקיד");

  const { data, error } = await admin()
    .from("fb_role_templates")
    .insert({
      role_key: b.role_key.trim(),
      role_label: b.role_label.trim(),
      emoji: b.emoji ?? null,
      headline: b.headline ?? null,
      body: b.body ?? null,
      requirements: b.requirements ?? [],
      sort_order: b.sort_order ?? 99,
    })
    .select()
    .single();
  if (error) return bad(error.message, 500);
  return NextResponse.json({ template: data });
}
