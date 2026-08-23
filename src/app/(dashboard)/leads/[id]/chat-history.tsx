"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { sendMessage } from "@/lib/actions/sendMessage";
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
}

interface SenderInfo {
  connected: boolean;
  state?: string;
  phone?: string | null;
  label?: string | null;
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
}: {
  leadId: string;
  leadStatus: LeadStatusValue;
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

  const isScreening = leadStatus === LeadStatus.SCREENING_IN_PROGRESS;

  // Determines if a message is outgoing (from our side: AI or recruiter)
  const isOutgoing = (role: string) => role === "assistant" || role === "recruiter";

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

  // AI screening flow (existing)
  async function handleScreeningSend(text: string) {
    const tempUserMsg: Message = {
      id: "temp-user-" + Date.now(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    const result = await sendMessage(leadId, text);

    if (result.success) {
      await fetchMessages();
    } else {
      setError(result.error ?? "שגיאה בשליחת ההודעה");
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    }
  }

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

    if (isScreening) {
      await handleScreeningSend(text);
    } else {
      await handleManualSend(text);
    }

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
            {isScreening
              ? "אין הודעות עדיין. שלח הודעה כדי להתחיל סינון."
              : "אין הודעות עדיין. שלח הודעה למועמד/ת."}
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
                    <div
                      className={`flex items-center gap-1.5 mt-1 ${
                        outgoing ? "text-cyan-200" : "text-gray-400"
                      }`}
                      dir="ltr"
                    >
                      <span className="text-[10px]">
                        {formatTime(msg.created_at)}
                      </span>
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
      {canSend && !isScreening && sender && (
        <div className="px-4 pt-2 text-[10px] text-gray-400 flex items-center gap-1.5">
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
              שולח ממספר ברירת המחדל של המערכת ·{" "}
              <Link href="/settings/whatsapp" className="hover:underline">
                חבר את המספר שלך
              </Link>
            </span>
          )}
        </div>
      )}

      {/* Input area */}
      {canSend && (
      <div className="flex gap-2 pt-3 px-4 pb-3 border-t border-gray-100">
        {isScreening && (
          <span className="self-center text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
            AI
          </span>
        )}
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={isScreening ? "סמלץ הודעת מועמד..." : "כתוב הודעה למועמד/ת..."}
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
