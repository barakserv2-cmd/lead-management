import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getSupabaseAdmin } from "@/lib/api-auth";
import { isFinanceUser } from "@/lib/finance";

// ── כתיבת נתונים כספיים — סער בלבד ─────────────────────────
//   POST { action: "set_fee",  fee }
//   POST { action: "set_cost", source, month (YYYY-MM-01), amount }
// האכיפה כאן היא האמת: גם מי שמנחש את ה-URL מקבל 403.

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });
  if (!isFinanceUser(user.email)) {
    return NextResponse.json({ error: "הנתונים הכספיים מוגבלים" }, { status: 403 });
  }

  let body: {
    action?: string;
    fee?: number;
    source?: string;
    month?: string;
    amount?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  if (body.action === "set_fee") {
    const fee = Number(body.fee);
    if (!Number.isFinite(fee) || fee < 0 || fee > 1_000_000) {
      return NextResponse.json({ error: "סכום לא תקין" }, { status: 400 });
    }
    const { error } = await admin
      .from("finance_settings")
      .update({ default_placement_fee: fee, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "set_cost") {
    const source = (body.source ?? "").trim();
    const month = (body.month ?? "").trim();
    const amount = Number(body.amount);
    if (!source || !/^\d{4}-\d{2}-01$/.test(month) || !Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
    }
    const { error } = await admin
      .from("channel_costs")
      .upsert(
        {
          source,
          month,
          amount,
          created_by: user.email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "source,month" }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action לא מוכר" }, { status: 400 });
}
