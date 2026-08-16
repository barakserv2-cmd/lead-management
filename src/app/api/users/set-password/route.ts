import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

// קביעת/איפוס סיסמה למשתמש מערכת מתוך מסך המשתמשים.
// אם למשתמש עוד אין חשבון התחברות (טבלת user_profiles היא תצוגה בלבד) —
// נוצר לו חשבון אמיתי עם הסיסמה שנקבעה; אם יש — הסיסמה מתעדכנת.

function getAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email) return NextResponse.json({ error: "חסר אימייל" }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: "סיסמה חייבת להיות באורך 8 תווים לפחות" }, { status: 400 });
  }

  const admin = getAdmin();

  // מגבילים את הפעולה למשתמשים שמופיעים במסך המשתמשים של המערכת —
  // אי אפשר ליצור דרך כאן חשבון לכתובת שרירותית.
  const { data: profile } = await admin
    .from("user_profiles")
    .select("id, email")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      { error: "האימייל לא נמצא ברשימת המשתמשים — הוסף אותו קודם במסך זה" },
      { status: 404 }
    );
  }

  // מחפשים חשבון התחברות קיים לפי אימייל (הצוות קטן — עמוד אחד מספיק,
  // אבל נעבור עד 5 עמודים ליתר ביטחון)
  let existingId: string | null = null;
  for (let page = 1; page <= 5 && !existingId; page++) {
    const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) break;
    const hit = list.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) existingId = hit.id;
    if (list.users.length < 100) break;
  }

  if (existingId) {
    const { error } = await admin.auth.admin.updateUserById(existingId, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, created: false });
  }

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });

  return NextResponse.json({ success: true, created: true });
}
