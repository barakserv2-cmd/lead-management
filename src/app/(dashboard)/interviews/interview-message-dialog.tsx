"use client";

import { useEffect, useState } from "react";
import { buildInterviewConfirmation } from "@/lib/interviewMessage";

interface Props {
  name: string;
  phone: string | null;
  interviewDate: string;
  jobTitle?: string | null;
  interviewType?: "phone" | "in_person" | "video" | null;
  recruiter?: string | null;
}

function waIntl(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  return d;
}

export function InterviewMessageDialog({ name, phone, interviewDate, jobTitle, interviewType, recruiter }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  function openDialog() {
    setText(buildInterviewConfirmation({ name, interviewDate, jobTitle, interviewType, recruiter }));
    setCopied(false);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="text-xs px-2 py-1 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold hover:bg-emerald-100 transition-colors"
        title="הודעת אישור ראיון מוכנה לוואטסאפ"
      >
        📩 אישור
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div dir="rtl" className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg mx-4 p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">הודעת אישור ראיון</h3>
                <p className="text-sm text-slate-500 mt-0.5">{name} · אפשר לערוך לפני השליחה</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 text-xl leading-none">
                ×
              </button>
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={16}
              dir="rtl"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm leading-relaxed bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans whitespace-pre-wrap"
            />
            <p className="text-xs text-slate-400 mt-1">
              כוכביות מסמנות הדגשה בוואטסאפ. שורה ריקה בין בלוקים — כך ההודעה נשארת קריאה בנייד.
            </p>

            <div className="flex items-center gap-2 mt-4">
              {phone ? (
                <a
                  href={`https://wa.me/${waIntl(phone)}?text=${encodeURIComponent(text)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  פתח בוואטסאפ
                </a>
              ) : (
                <span className="flex-1 text-center px-4 py-2.5 bg-slate-100 text-slate-400 text-sm font-semibold rounded-lg">
                  אין טלפון לליד
                </span>
              )}
              <button
                type="button"
                onClick={copy}
                className="px-4 py-2.5 border border-slate-300 bg-white text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
              >
                {copied ? "הועתק ✓" : "העתק"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
