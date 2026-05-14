"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { getJobMatches, type JobMatch } from "@/lib/actions/jobMatches";
import { STATUS_LABELS, STATUS_COLORS, type LeadStatusValue } from "@/lib/stateMachine";
import Link from "next/link";

function formatPhoneIntl(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/[\s\-()]/g, "").replace(/^0/, "972");
}

function scoreColor(score: number): { bg: string; text: string; label: string } {
  if (score >= 80) return { bg: "bg-green-100", text: "text-green-800", label: "מעולה" };
  if (score >= 60) return { bg: "bg-emerald-100", text: "text-emerald-800", label: "טוב" };
  if (score >= 40) return { bg: "bg-yellow-100", text: "text-yellow-800", label: "סביר" };
  return { bg: "bg-gray-100", text: "text-gray-700", label: "חלש" };
}

interface JobMatchesSheetProps {
  open: boolean;
  jobId: string | null;
  jobTitle: string;
  clientName: string;
  onOpenChange: (open: boolean) => void;
}

export function JobMatchesSheet({ open, jobId, jobTitle, clientName, onOpenChange }: JobMatchesSheetProps) {
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !jobId) return;
    let cancelled = false;
    setLoading(true);
    getJobMatches(jobId, 30).then((res) => {
      if (cancelled) return;
      setMatches(res);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, jobId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-xl p-0 overflow-y-auto" dir="rtl">
        <SheetHeader className="px-6 pt-6 pb-3 border-b">
          <SheetTitle className="text-lg font-bold text-gray-900">התאמות למשרה</SheetTitle>
          <SheetDescription className="text-sm text-gray-600">
            {jobTitle} · {clientName}
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400">
              <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-cyan-600 rounded-full animate-spin ml-2" />
              מחפש מועמדים...
            </div>
          ) : matches.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-500">
              לא נמצאו מועמדים מתאימים.
              <br />
              <span className="text-xs text-gray-400">נסה לפתוח את המשרה לעוד מועמדים על ידי הוספת לידים חדשים.</span>
            </div>
          ) : (
            <>
              <div className="mb-3 text-xs text-gray-500">
                <span className="font-semibold">{matches.length}</span> מועמדים פוטנציאליים, ממוינים לפי ציון התאמה
              </div>
              <div className="space-y-2">
                {matches.map((m) => {
                  const sc = scoreColor(m.score);
                  const statusStyle = STATUS_COLORS[m.status as LeadStatusValue] ?? { bg: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-500" };
                  const intlPhone = formatPhoneIntl(m.phone);
                  return (
                    <div
                      key={m.lead_id}
                      className="border border-gray-200 rounded-xl p-3 hover:border-cyan-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Link
                              href={`/leads/${m.lead_id}`}
                              className="text-sm font-semibold text-gray-900 hover:text-cyan-600 truncate"
                            >
                              {m.name}
                            </Link>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
                              <span className={`w-1 h-1 rounded-full ${statusStyle.dot}`} />
                              {STATUS_LABELS[m.status as LeadStatusValue] ?? m.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-500 space-x-2 space-x-reverse">
                            {m.job_title && <span>{m.job_title}</span>}
                            {m.location && <span>· {m.location}</span>}
                            {m.phone && <span dir="ltr" className="text-gray-400">· {m.phone}</span>}
                          </div>
                        </div>
                        <div className={`flex-shrink-0 flex flex-col items-center px-2 py-1 rounded-lg ${sc.bg}`}>
                          <span className={`text-base font-bold ${sc.text} leading-none`}>{m.score}</span>
                          <span className={`text-[9px] ${sc.text} font-medium mt-0.5`}>{sc.label}</span>
                        </div>
                      </div>

                      {m.reasons && m.reasons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {m.reasons.map((r) => (
                            <span key={r} className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-50 text-cyan-700 border border-cyan-100">
                              {r}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5">
                        {intlPhone && (
                          <a
                            href={`https://api.whatsapp.com/send?phone=${intlPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
                            </svg>
                            וואטסאפ
                          </a>
                        )}
                        <Link
                          href={`/leads/${m.lead_id}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 transition-colors"
                        >
                          פתח כרטיס
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
