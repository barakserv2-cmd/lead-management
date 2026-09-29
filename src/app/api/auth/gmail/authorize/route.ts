import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createOAuth2Client } from "@/lib/gmail";
import { getAuthedUser } from "@/lib/api-auth";
import { GMAIL_STATE_COOKIE } from "../state";

// חיבור תיבת הלידים: רק אדמין, ועם state חד-פעמי שנבדק ב-callback.
// קודם כל אחד (גם בלי התחברות) יכול היה לחבר תיבת Gmail אחרת, והסורק היה
// קורא ממנה במקום מתיבת החברה — לידים אמיתיים היו מפסיקים להיכנס.
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const user = await getAuthedUser();
  if (!user?.isAdmin) {
    return NextResponse.redirect(
      `${baseUrl}/settings?gmail_error=${encodeURIComponent("רק אדמין יכול לחבר את תיבת הלידים")}`
    );
  }

  const state = randomBytes(24).toString("hex");
  const oauth2Client = createOAuth2Client();

  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    state,
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(GMAIL_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/gmail",
    maxAge: 600,
  });
  return res;
}
