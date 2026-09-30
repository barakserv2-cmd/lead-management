import { NextResponse } from "next/server";
import { getMessageScope } from "@/lib/messageVisibility";
import { listApprovedTemplates, resolveSender } from "@/lib/whatsappService";
import { getAuthedUser } from "@/lib/api-auth";

// GET — התבניות המאושרות של המספר שממנו הרכזת שולחת.
// ריק = אין תבניות (או שהמספר לא בערוץ הרשמי), והצ'אט מסביר את זה.
export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = await getMessageScope(user.email);
  if (!scope.canSend) return NextResponse.json({ templates: [], from: null });

  const sender = await resolveSender(user.email);
  const templates = await listApprovedTemplates(sender);
  return NextResponse.json({
    templates,
    from: sender.label ?? sender.phone ?? null,
    official: sender.provider === "cloud",
  });
}
