import { NextResponse } from "next/server";
import { createOAuth2Client } from "@/lib/gmail";

export async function GET() {
  const oauth2Client = createOAuth2Client();

  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });

  return NextResponse.redirect(authorizeUrl);
}
