/**
 * גשר למכונת הגיוס — צד התשובות.
 * כל תשובה שיוצאת מהמערכת (סוכן AI או רכזת) נשלחת גם למכונה החדשה
 * לצורך מסך "השוואת מציאות" בתקופת ה-shadow.
 *
 * עקרון ברזל: הפונקציה לעולם לא זורקת ולעולם לא מעכבת — כשל בגשר
 * לא נוגע בזרימה הקיימת.
 */
export async function forwardReplyToMachine(
  phone: string | null | undefined,
  content: string,
  author: "crm" | "human"
): Promise<void> {
  const url = process.env.MACHINE_INGEST_URL;
  const key = process.env.MACHINE_INGEST_KEY;
  if (!url || !key || !phone || !content?.trim()) return;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch(`${url}/api/v1/bridge/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-key": key },
      body: JSON.stringify({ phone, content: content.trim(), author }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (e) {
    console.error("[MachineBridge] reply forward failed:", (e as Error).message);
  }
}

/**
 * Tell Gubget whether it may keep talking to a candidate. "bot" releases it
 * back to autonomous handling; "human" keeps it frozen. Returns true on
 * success so the caller can surface a failure (unlike the fire-and-forget
 * reply forward, the recruiter needs to know if the release didn't land).
 */
export async function setMachineConversationMode(
  phone: string | null | undefined,
  mode: "bot" | "human"
): Promise<boolean> {
  const url = process.env.MACHINE_INGEST_URL;
  const key = process.env.MACHINE_INGEST_KEY;
  if (!url || !key || !phone) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${url}/api/v1/conversation-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-key": key },
      body: JSON.stringify({ phone, mode }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    return res.ok;
  } catch (e) {
    console.error("[MachineBridge] set conversation mode failed:", (e as Error).message);
    return false;
  }
}
