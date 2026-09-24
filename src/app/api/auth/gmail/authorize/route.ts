import { NextResponse } from "next/server";
import { createOAuth2Client } from "@/lib/gmail";
import { getAuthedUser } from "@/lib/api-auth";
import { createOAuthState } from "@/lib/oauthState";

// חיבור תיבת הג'ימייל שממנה נקראים לידי AllJobs הוא פעולת ניהול, לא נתיב
// ציבורי. עד 24.09 כל אדם יכול היה לפתוח את הזרימה הזו — ראו oauthState.ts.
export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const oauth2Client = createOAuth2Client();

  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    state: createOAuthState(user.email),
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });

  return NextResponse.redirect(authorizeUrl);
}
