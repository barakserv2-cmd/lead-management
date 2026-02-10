import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
});

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

const SUBJECT_RE = /מועמדות חדשה מ(.+?)\s+למשרת\s+(.+)/;
const PHONE_RE = /0[2-9]\d-?\d{7}/g;
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const ALLJOBS_DOMAINS = ["alljob.co.il", "alljobs.co.il"];

export function parseSubject(subject: string): {
  name: string | null;
  job_title: string | null;
} {
  const match = subject.match(SUBJECT_RE);
  if (match) {
    return { name: match[1].trim(), job_title: match[2].trim() };
  }
  return { name: null, job_title: null };
}

export function extractPhone(text: string): string | null {
  const matches = text.match(PHONE_RE);
  return matches ? matches[0] : null;
}

export function extractEmail(text: string): string | null {
  const matches = text.match(EMAIL_RE);
  if (!matches) return null;
  for (const email of matches) {
    const domain = email.split("@")[1].toLowerCase();
    if (!ALLJOBS_DOMAINS.some((d) => domain.includes(d))) {
      return email;
    }
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|tr|li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function extractBodyFromPayload(payload: {
  mimeType?: string;
  body?: { data?: string };
  parts?: Array<{
    mimeType?: string;
    body?: { data?: string };
    parts?: unknown[];
  }>;
}): string {
  // If the payload has parts, recurse
  if (payload.parts) {
    // Prefer text/plain, fall back to text/html
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return stripHtml(decodeBase64Url(part.body.data));
      }
    }
    // Recurse into nested parts
    for (const part of payload.parts) {
      if ((part as { parts?: unknown[] }).parts) {
        const result = extractBodyFromPayload(
          part as Parameters<typeof extractBodyFromPayload>[0]
        );
        if (result) return result;
      }
    }
  }

  // Single-part message
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") {
      return stripHtml(decoded);
    }
    return decoded;
  }

  return "";
}

export interface GmailMessage {
  id: string;
  subject: string;
  body: string;
  date: string;
}

export async function fetchUnreadEmails(
  maxResults = 20
): Promise<GmailMessage[]> {
  const res = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread {AllJobs CV קורות חיים משרה פנייה מועמד lead candidate CASHIERS \"FB JOBS\" INFINES}",
    maxResults,
  });

  const messages = res.data.messages || [];
  const results: GmailMessage[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = full.data.payload?.headers || [];
    const subject =
      headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
    const date =
      headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";
    const body = full.data.payload
      ? extractBodyFromPayload(
          full.data.payload as Parameters<typeof extractBodyFromPayload>[0]
        )
      : "";

    results.push({ id: msg.id, subject, body, date });
  }

  return results;
}

export async function markAsRead(messageId: string): Promise<void> {
  try {
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        removeLabelIds: ["UNREAD"],
      },
    });
  } catch (error) {
    // If we only have readonly scope, log and continue
    console.warn(
      `Could not mark message ${messageId} as read (may need gmail.modify scope):`,
      error instanceof Error ? error.message : error
    );
  }
}
