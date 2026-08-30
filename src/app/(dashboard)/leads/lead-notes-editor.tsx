"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// ההערות החופשיות של הליד. עד עכשיו הן הוצגו בכרטיס לקריאה בלבד — אפשר היה
// לראות מה נכתב אבל לא לתקן שגיאה או להוסיף מידע. עריכה במקום, בלי לצאת
// מהכרטיס.
export function LeadNotesEditor({
  leadId,
  notes,
  followupNotes,
}: {
  leadId: string;
  notes: string | null;
  followupNotes: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [draftFollowup, setDraftFollowup] = useState(followupNotes ?? "");
  // מה שנשמר בפועל, כדי שהתצוגה תתעדכן מיד ולא רק אחרי refresh
  const [savedNotes, setSavedNotes] = useState(notes ?? "");
  const [savedFollowup, setSavedFollowup] = useState(followupNotes ?? "");

  function startEdit() {
    setDraft(savedNotes);
    setDraftFollowup(savedFollowup);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: draft, followup_notes: draftFollowup }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "שמירת ההערות נכשלה");
        return;
      }
      setSavedNotes(draft);
      setSavedFollowup(draftFollowup);
      setEditing(false);
      toast.success("ההערות נשמרו");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const isEmpty = !savedNotes.trim() && !savedFollowup.trim();

  return (
    <div className="px-6 pb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">הערות</h3>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="text-xs text-cyan-700 hover:text-cyan-900 font-medium"
          >
            {isEmpty ? "+ הוסף הערה" : "ערוך"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="bg-white rounded-lg border p-3 space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">הערות</label>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              autoFocus
              className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">הערות מעקב</label>
            <textarea
              value={draftFollowup}
              onChange={(e) => setDraftFollowup(e.target.value)}
              rows={3}
              className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700 disabled:opacity-50"
            >
              {saving ? "שומר..." : "שמור"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
            >
              ביטול
            </button>
          </div>
        </div>
      ) : isEmpty ? (
        <p className="text-sm text-gray-400 bg-white rounded-lg border p-3">אין הערות</p>
      ) : (
        <div className="bg-white rounded-lg border p-3 space-y-2">
          {savedNotes.trim() && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{savedNotes}</p>
          )}
          {savedFollowup.trim() && (
            <div className="pt-2 border-t">
              <span className="text-xs text-gray-500 block mb-1">הערות מעקב</span>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{savedFollowup}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
