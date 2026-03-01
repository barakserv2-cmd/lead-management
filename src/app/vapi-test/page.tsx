"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Vapi from "@vapi-ai/web";

const PUBLIC_KEY = "ae93dc6a-a162-4357-b9c2-dfb0561fe3d1";

export default function VapiTestPage() {
  const vapiRef = useRef<Vapi | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "active" | "ending">("idle");
  const [transcript, setTranscript] = useState<{ role: string; text: string }[]>([]);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [assistantId, setAssistantId] = useState("e15b3a24-5ae6-4747-95d4-690b2f3cb885");
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!PUBLIC_KEY) {
      setError("NEXT_PUBLIC_VAPI_PUBLIC_KEY is not set in .env.local");
      return;
    }
    const vapi = new Vapi(PUBLIC_KEY);
    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      setStatus("active");
      setError(null);
    });

    vapi.on("call-end", () => {
      setStatus("idle");
      setVolume(0);
    });

    vapi.on("message", (msg) => {
      if (msg.type === "transcript" && msg.transcriptType === "final") {
        setTranscript((prev) => [...prev, { role: msg.role, text: msg.transcript }]);
      }
    });

    vapi.on("volume-level", (level) => {
      setVolume(level);
    });

    vapi.on("error", (err) => {
      console.error("Vapi error event:", err);
      let msg: string;
      if (typeof err === "string") {
        msg = err;
      } else if (err && typeof err === "object") {
        const e = err as Record<string, unknown>;
        msg = (e.errorMessage ?? e.message ?? e.error ?? JSON.stringify(err)) as string;
      } else {
        msg = String(err);
      }
      setError(msg);
      setStatus("idle");
    });

    return () => {
      vapi.stop();
    };
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const startCall = useCallback(async () => {
    if (!vapiRef.current || !assistantId.trim()) return;
    setError(null);
    setTranscript([]);
    setStatus("connecting");
    try {
      console.log("Starting call with Public Key:", PUBLIC_KEY);
      console.log("Starting call with Assistant ID:", assistantId.trim());
      await vapiRef.current.start(assistantId.trim(), {
        transcriber: {
          provider: "openai",
          model: "gpt-4o-transcribe",
          language: "he",
        },
        voice: {
          provider: "11labs",
          voiceId: "pNInz6obpgDQGcFmaJgB",
          model: "eleven_multilingual_v2",
        },
        model: {
          provider: "openai",
          model: "gpt-4o",
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: "CRITICAL: You are an Israeli representative named Tomer. You MUST think, speak, and respond EXCLUSIVELY in Hebrew (עברית).\n\nPRONUNCIATION GUIDE:\n- When mentioning קב״ט, pronounce it naturally as 'קבאט' (Kabat).\n- When mentioning צ'קר, pronounce it as 'צֶ׳קֶר'.\n- When mentioning בל בוי, pronounce it as 'בֶּל בּוֹי'.\n- Speak with a warm, energetic, and natural Israeli tone. Do not sound robotic. Use short, conversational phrases.",
            },
          ],
        },
        firstMessage: "היי, מדבר תומר מחברת ברק שירותים. מה נשמע?",
      });
    } catch (err) {
      console.error("Vapi start error:", err);
      setError(err instanceof Error ? err.message : JSON.stringify(err));
      setStatus("idle");
    }
  }, [assistantId]);

  const endCall = useCallback(() => {
    if (!vapiRef.current) return;
    setStatus("ending");
    vapiRef.current.stop();
  }, []);

  const isActive = status === "active";
  const isConnecting = status === "connecting";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-l from-blue-600 to-blue-700 px-6 py-4">
          <h1 className="text-lg font-bold text-white">בדיקת Vapi Voice AI</h1>
          <p className="text-blue-200 text-xs mt-0.5">שיחה קולית עם העוזר הווירטואלי</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Assistant ID input */}
          <div className="space-y-1.5">
            <label htmlFor="assistant-id" className="text-sm font-medium text-gray-700">
              Assistant ID
            </label>
            <input
              id="assistant-id"
              type="text"
              value={assistantId}
              onChange={(e) => setAssistantId(e.target.value)}
              placeholder="הכנס Assistant ID מה-dashboard של Vapi"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              dir="ltr"
              disabled={isActive || isConnecting}
            />
          </div>

          {/* Call button */}
          <div className="flex justify-center">
            {isActive || isConnecting ? (
              <button
                type="button"
                onClick={endCall}
                disabled={status !== "active"}
                className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-all hover:scale-105 disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                  <line x1="23" y1="1" x2="1" y2="23" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={startCall}
                disabled={!assistantId.trim()}
                className="w-20 h-20 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </button>
            )}
          </div>

          {/* Status indicator */}
          <div className="text-center">
            {isConnecting && (
              <span className="inline-flex items-center gap-1.5 text-sm text-amber-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                מתחבר...
              </span>
            )}
            {isActive && (
              <span className="inline-flex items-center gap-1.5 text-sm text-green-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                שיחה פעילה
              </span>
            )}
            {status === "idle" && !error && (
              <span className="text-sm text-gray-400">לחץ על הכפתור כדי להתחיל שיחה</span>
            )}
          </div>

          {/* Volume bar */}
          {isActive && (
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-100"
                style={{ width: `${Math.min(volume * 100, 100)}%` }}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Transcript */}
          {transcript.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 border-b">
                <span className="text-xs font-medium text-gray-500">תמלול שיחה</span>
              </div>
              <div className="max-h-60 overflow-y-auto p-3 space-y-2">
                {transcript.map((t, i) => (
                  <div key={i} className={`flex ${t.role === "user" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[80%] px-3 py-1.5 rounded-lg text-sm ${
                      t.role === "user"
                        ? "bg-blue-50 text-blue-900"
                        : "bg-gray-100 text-gray-900"
                    }`}>
                      <span className="text-[10px] font-medium text-gray-400 block mb-0.5">
                        {t.role === "user" ? "אתה" : "עוזר"}
                      </span>
                      {t.text}
                    </div>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
