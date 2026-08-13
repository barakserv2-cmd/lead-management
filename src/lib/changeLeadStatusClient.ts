import type { ChangeStatusInput, ChangeStatusResult } from "@/lib/actions/changeLeadStatus";

// Client-side replacement for the changeLeadStatus server action. Plain
// fetch to the internal API route so Next.js 16's implicit RSC refresh
// after server actions can't slow the save or reject the promise —
// callers keep the exact same signature and result shape.
export async function changeLeadStatus(input: ChangeStatusInput): Promise<ChangeStatusResult> {
  try {
    const res = await fetch("/api/leads/change-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const data = (await res.json().catch(() => ({}))) as ChangeStatusResult;

    if (!res.ok) {
      return { success: false, error: data.error ?? res.statusText };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "שגיאת רשת בעדכון הסטטוס",
    };
  }
}
