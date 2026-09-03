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
