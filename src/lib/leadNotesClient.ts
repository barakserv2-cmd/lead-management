/**
 * Client-side helper to save a lead's notes via the robust fetch API
 * (/api/leads/[id]/notes) instead of the flaky `updateLeadNotes` server action.
 * Returns the notes actually stored server-side so the caller can re-sync its
 * textarea to the truth — important when an empty save was ignored to protect
 * existing notes (`skipped: "empty_ignored"`).
 */
export async function saveLeadNotes(
  leadId: string,
  notes: string
): Promise<{ error: string | null; notes?: string; skipped?: string }> {
  try {
    const res = await fetch(`/api/leads/${leadId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error ?? "שגיאה בשמירה" };
    return { error: null, notes: data.notes, skipped: data.skipped };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאת רשת" };
  }
}
