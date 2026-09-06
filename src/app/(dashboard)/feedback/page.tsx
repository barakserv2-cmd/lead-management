"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Item = {
  id: string;
  author: string;
  category: "machine" | "system" | "other";
  body: string;
  status: "open" | "handled";
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
};

const CATS: { key: Item["category"]; label: string }[] = [
  { key: "machine", label: "המכונה (גובגט)" },
  { key: "system", label: "המערכת (CRM)" },
  { key: "other", label: "אחר" },
];
const CAT_LABEL: Record<string, string> = { machine: "המכונה", system: "המערכת", other: "אחר" };

export default function FeedbackPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<Item["category"]>("machine");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/feedback", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setItems(data.items ?? []);
        setIsAdmin(!!data.isAdmin);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, text }),
      });
      if (res.ok) {
        setText("");
        setSent(true);
        setTimeout(() => setSent(false), 2500);
        load();
      }
    } finally {
      setSending(false);
    }
  }

  async function toggleHandled(id: string) {
    const res = await fetch(`/api/feedback/${id}/handle`, { method: "POST" });
    if (res.ok) load();
  }

  return (
    <div dir="rtl" className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#142A3E]">דיווח בעיות</h1>
        <p className="text-sm text-gray-500 mt-1">
          נתקלת בבעיה עם המכונה או המערכת? כתבי כאן — סער מקבל סיכום יומי ומטפל.
        </p>
      </div>

      {/* Submit form */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex gap-2 flex-wrap">
          {CATS.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === c.key
                  ? "bg-[#0875E1] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="תארי את הבעיה — מה קרה, באיזה מסך/מועמד, ומה ציפית שיקרה..."
          dir="rtl"
          rows={4}
        />
        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={sending || !text.trim()}>
            {sending ? "שולח..." : "שלח דיווח"}
          </Button>
          {sent && <span className="text-sm text-green-600">✅ נשלח, תודה!</span>}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500">
          {isAdmin ? "כל הדיווחים" : "הדיווחים שלי"}
        </h2>
        {loading ? (
          <div className="text-sm text-gray-400 py-8 text-center">טוען...</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">אין דיווחים עדיין.</div>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              className={`bg-white border rounded-lg p-3 flex gap-3 items-start ${
                it.status === "handled" ? "border-gray-100 opacity-60" : "border-gray-200"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 mb-1">
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                    {CAT_LABEL[it.category]}
                  </span>
                  {isAdmin && <span className="font-medium text-gray-700">{it.author}</span>}
                  <span>{new Date(it.created_at).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  {it.status === "handled" && <span className="text-green-600">✓ טופל</span>}
                </div>
                <div className="text-sm text-[#142A3E] whitespace-pre-wrap break-words">{it.body}</div>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  variant={it.status === "handled" ? "outline" : "default"}
                  onClick={() => toggleHandled(it.id)}
                  className="flex-shrink-0 h-8 text-xs"
                >
                  {it.status === "handled" ? "החזר לפתוח" : "טופל"}
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
