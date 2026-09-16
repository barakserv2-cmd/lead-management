"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ReminderDialog } from "./reminder-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadStatus, type LeadStatusValue } from "@/lib/stateMachine";

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "recruiter";
  content: string;
  created_at: string;
  /** recruiter email that sent it (manual / from their phone) */
  sent_by?: string | null;
  /** מה הספק דיווח: נשלחה / נמסרה / נקראה / נכשלה. null = לא ידוע */
  delivery_status?: "sent" | "delivered" | "read" | "failed" | null;
  delivery_error?: string | null;
}

const DELIVERY_LABEL: Record<"sent" | "delivered" | "read", string> = {
  sent: "נשלחה",
  delivered: "נמסרה למועמד/ת",
  read: "נקראה",
};

/**
 * וי אחד = נשלחה, שני וי = נמסרה, שני וי כחולים = נקראה — כמו בוואטסאפ.
 * בלי סטטוס לא מציירים כלום: הודעה ישנה או הודעה שנכתבה מהטלפון, ועדיף
 * "לא ידוע" על פני וי שאף אחד לא אימת.
 */
function DeliveryTicks({ status }: { status: Message["delivery_status"] }) {
  if (!status || status === "failed") return null;
  const double = status !== "sent";
  const color = status === "read" ? "text-sky-300" : "text-cyan-100/80";
  return (
    <span className={`inline-flex ${color}`} title={DELIVERY_LABEL[status]} aria-label={DELIVERY_LABEL[status]}>
      <svg width={double ? 16 : 11} height="11" viewBox={double ? "0 0 16 11" : "0 0 11 11"} fill="none" aria-hidden="true">
        <path d="M1 6l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        {double && (
          <path d="M6 6l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </span>
  );
}

interface SenderInfo {
  connected: boolean;
  state?: string;
  phone?: string | null;
  label?: string | null;
  /** כשאין מספר משלך: המספר שההודעות יוצאות ממנו */
  defaultSender?: { label: string | null; phone: string | null } | null;
}

function senderShort(email: string): string {
  return email.split("@")[0];
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const POLL_INTERVAL = 5000;

export function ChatHistory({
  leadId,
  leadStatus,
  leadName = "",
  interviewDate = null,
}: {
  leadId: string;
  leadStatus: LeadStatusValue;
  leadName?: string;
  interviewDate?: string | null;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sender, setSender] = useState<SenderInfo | null>(null);
  const [canSend, setCanSend] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Which number will my messages go out from? (personal if linked)
  useEffect(() => {
    fetch("/api/whatsapp/account", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSender(d as SenderInfo))
      .catch(() => {});
  }, []);

  // ליד "בסינון" מנוהל ע"י גובגט. עד 16.09 התיבה כאן סימלצה מועמד: הטקסט
  // הלך למודל כאילו המועמד כתב, והתשובה נשמרה בצ'אט בלי שנשלחה לאיש —
  // ונראתה בדיוק כמו שיחה אמיתית של גובגט. סער בדק "שיחה" שלמה כך בלי
  // שדבר הגיע לטלפון. עכשיו התיבה תמיד שולחת באמת, ושליחה בליד שהבוט
  // מנהל מעבירה קודם את השיחה לרכזת — אחרת שניים מדברים עם אותו מועמד.
  const [humanTakeover, setHumanTakeover] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const botManaged = leadStatus === LeadStatus.SCREENING_IN_PROGRESS && !humanTakeover;

  // Determines if a message is outgoing (from our side: AI or recruiter)
  const isOutgoing = (role: string) => role === "assistant" || role === "recruiter";

  /** מעביר את השיחה לרכזת ועוצר את גובגט. true = הצליח. */
  async function takeOver(): Promise<boolean> {
    setTakingOver(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/takeover`, { method: "POST" });
      if (res.ok) setHumanTakeover(true);
      return res.ok;
    } catch {
      return false;
    } finally {
      setTakingOver(false);
    }
  }

  const fetchMessages = useCallback(async () => {
    // Server-side: only conversations this recruiter may see (business
    // number + their own personal WhatsApp; admins see all).
    try {
      const res = await fetch(`/api/leads/${leadId}/messages`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "שגיאה בטעינת ההודעות");
      } else {
        setMessages((data.messages as Message[]) ?? []);
        if (typeof data.canSend === "boolean") setCanSend(data.canSend);
        if (typeof data.needsHumanAttention === "boolean") setHumanTakeover(data.needsHumanAttention);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת ההודעות");
    }
  }, [leadId]);

  // Fetch messages on mount
  useEffect(() => {
    // async fetch — setState only runs after the network round-trip
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMessages().finally(() => setLoading(false));
  }, [fetchMessages]);

  // Poll for new messages (incoming WhatsApp)
  useEffect(() => {
    const interval = setInterval(fetchMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Manual recruiter send (new)
  async function handleManualSend(text: string) {
    const tempMsg: Message = {
      id: "temp-recruiter-" + Date.now(),
      role: "recruiter",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await fetch("/api/whatsapp/send-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, message: text }),
      });
      const result = await res.json();

      if (!result.success) {
        setError(result.error ?? "שגיאה בשליחת ההודעה");
        // אם ההודעה כן נשמרה בצ'אט (רק הוואטסאפ נכשל) — משאירים את
        // הבועה; אחרת מסירים אותה.
        if (result.savedToChat) {
          await fetchMessages();
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
        }
      } else {
        await fetchMessages();
      }
    } catch {
      setError("שגיאה בשליחת ההודעה");
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
    }
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || sending) return;

    setError(null);
    setSending(true);
    setInputText("");

    // לא שולחים כל עוד הבוט עדיין פעיל בשיחה — עדיף שההודעה לא תצא
    // מאשר שהמועמד יקבל תשובה מהבוט ומהרכזת באותו רגע.
    // קודם בודקים שההודעה בכלל יכולה לצאת (חלון 24 שעות בערוץ הרשמי) —
    // אחרת הבוט נעצר והמועמד נשאר בלי אף אחד.
    if (botManaged) {
      const pre = await fetch("/api/whatsapp/send-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, check: true }),
      })
        .then((r) => r.json())
        .catch(() => null);
      if (pre && pre.success === false) {
        setError(pre.error ?? "אי אפשר לשלוח מכאן כרגע");
        setInputText(text);
        setSending(false);
        return;
      }
    }
    if (botManaged && !(await takeOver())) {
      setError("לא הצלחתי לעצור את הבוט בשיחה הזו — ההודעה לא נשלחה. נסי שוב.");
      setInputText(text);
      setSending(false);
      return;
    }
    await handleManualSend(text);

    setSending(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        טוען שיחה...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 p-4 bg-[#f8f9fa]"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            אין הודעות עדיין. שלח הודעה למועמד/ת.
          </div>
        ) : (
          messages
            .filter((m) => m.role !== "system")
            .map((msg) => {
              const outgoing = isOutgoing(msg.role);
              return (
                <div
                  key={msg.id}
                  className={`flex ${outgoing ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      outgoing
                        ? "bg-gradient-to-br from-cyan-600 to-cyan-700 text-white rounded-br-md"
                        : "bg-white text-gray-800 border border-gray-100 rounded-bl-md shadow-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap" dir="rtl">
                      {msg.content}
                    </p>
                    {/* כישלון מסירה: הרכזת צריכה לראות גם שזה נכשל וגם מה לעשות */}
                    {outgoing && msg.delivery_status === "failed" && (
                      <div
                        className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] leading-snug text-red-700"
                        dir="rtl"
                        role="status"
                      >
                        <span className="font-semibold">⚠ לא נמסרה.</span>{" "}
                        {msg.delivery_error ?? "הספק דיווח שההודעה לא הגיעה למועמד/ת."}
                      </div>
                    )}
                    <div
                      className={`flex items-center gap-1.5 mt-1 ${
                        outgoing ? "text-cyan-200" : "text-gray-400"
                      }`}
                      dir="ltr"
                    >
                      <span className="text-[10px]">
                        {formatTime(msg.created_at)}
                      </span>
                      {outgoing && <DeliveryTicks status={msg.delivery_status} />}
                      {msg.role === "assistant" && (
                        <span className="text-[9px] opacity-70">AI</span>
                      )}
                      {msg.role === "recruiter" && msg.sent_by && (
                        <span className="text-[9px] opacity-70" title={msg.sent_by}>
                          {senderShort(msg.sent_by)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
        )}

        {/* Typing indicator when sending */}
        {sending && (
          <div className="flex justify-end">
            <div className="bg-cyan-600/80 rounded-2xl rounded-br-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="px-3 py-2 text-xs text-red-600 bg-red-50 rounded-md mt-2">
          {error}
        </div>
      )}

      {/* Read-only viewer (no linked number) */}
      {!canSend && (
        <div className="mx-4 mt-2 px-3 py-2 text-xs text-gray-600 bg-gray-100 rounded-md">
          צפייה בלבד — אין לך מספר וואטסאפ מחובר, אז אפשר לקרוא את השיחה אבל לא לשלוח.{" "}
          <Link href="/settings/whatsapp" className="underline">חבר מספר</Link>
        </div>
      )}

      {/* Which number the recruiter's messages go out from */}
      {/* ההודעה תמיד יוצאת באמת — אז תמיד מראים מאיזה מספר */}
      {canSend && sender && (
        <div className="px-4 pt-2 text-[10px] text-gray-400 flex items-center gap-1.5">
          <span className="ms-auto order-last">
            <ReminderDialog leadId={leadId} leadName={leadName} interviewDate={interviewDate} />
          </span>
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              !sender.connected
                ? "bg-gray-300"
                : sender.state === "authorized"
                  ? "bg-green-500"
                  : "bg-amber-500"
            }`}
          />
          {sender.connected ? (
            sender.state === "authorized" ? (
              <span>
                שולח מהוואטסאפ שלך
                {sender.phone && (
                  <span className="font-mono ms-1" dir="ltr">
                    {sender.phone.replace(/^972/, "0")}
                  </span>
                )}
              </span>
            ) : (
              <Link href="/settings/whatsapp" className="hover:underline text-amber-600">
                הוואטסאפ שלך מנותק — לחץ לחיבור
              </Link>
            )
          ) : (
            <span>
              {sender.defaultSender ? (
                <>
                  שולח מהמספר של {sender.defaultSender.label ?? "ברירת המחדל"}
                  {sender.defaultSender.phone && (
                    <span className="font-mono ms-1" dir="ltr">
                      {sender.defaultSender.phone.replace(/^972/, "0")}
                    </span>
                  )}
                </>
              ) : (
                "שולח ממספר ברירת המחדל של המערכת"
              )}{" "}
              ·{" "}
              <Link href="/settings/whatsapp" className="hover:underline">
                חבר את המספר שלך
              </Link>
            </span>
          )}
        </div>
      )}

      {/* הבוט מנהל את השיחה. רכזת יכולה להיכנס בכל רגע — בכתיבה או בכפתור. */}
      {canSend && botManaged && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-amber-50 border-t border-amber-100 text-xs text-amber-800">
          <span>הבוט מנהל את השיחה הזו. הודעה שתשלחי תעבור למועמד/ת בוואטסאפ ותעצור את הבוט.</span>
          <Button onClick={takeOver} disabled={takingOver} size="sm" variant="outline" className="h-7 px-3 text-xs flex-shrink-0">
            {takingOver ? "..." : "קח שליטה"}
          </Button>
        </div>
      )}

      {/* Input area */}
      {canSend && (
      <div className="flex gap-2 pt-3 px-4 pb-3 border-t border-gray-100">
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={botManaged ? "כתיבה כאן תעצור את הבוט ותשלח למועמד/ת..." : "כתוב הודעה למועמד/ת..."}
          disabled={sending}
          dir="rtl"
          className="flex-1"
        />
        <Button
          onClick={handleSend}
          disabled={sending || !inputText.trim()}
          size="sm"
          className="px-4"
        >
          {sending ? "..." : "שלח"}
        </Button>
      </div>
      )}
    </div>
  );
}
