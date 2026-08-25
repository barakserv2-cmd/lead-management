"use client";

// דף חתימה ציבורי למועמד — מובייל-first, RTL.
// המועמד רואה את המסמך, מצייר חתימה על canvas, והדפדפן מרכיב
// חותמת PNG (שם + תאריך + חתימה) שנשלחת לשרת להטבעה על ה-PDF.

import { useCallback, useEffect, useRef, useState } from "react";

interface DocInfo {
  status: "pending" | "signed" | "expired" | "not_found" | "error";
  docLabel?: string;
  fileName?: string;
  mime?: string;
  url?: string;
  firstName?: string | null;
}

export function SignClient({ token }: { token: string }) {
  const [info, setInfo] = useState<DocInfo | null>(null);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    fetch(`/api/sign/${token}`)
      .then(async (r) => setInfo((await r.json()) as DocInfo))
      .catch(() => setInfo({ status: "error" }));
  }, [token]);

  // ── ציור על ה-canvas ───────────────────────────────────────
  const setupCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#1e3a5f";
  }, []);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = pointFromEvent(e);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !lastPoint.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
    if (!hasDrawn) setHasDrawn(true);
  }

  function onPointerUp() {
    drawing.current = false;
    lastPoint.current = null;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  // ── הרכבת חותמת ה-PNG ושליחה ───────────────────────────────
  async function submit() {
    const sigCanvas = canvasRef.current;
    if (!sigCanvas || !hasDrawn || name.trim().length < 2 || !agreed) return;
    setSubmitting(true);
    setError(null);

    try {
      const stamp = document.createElement("canvas");
      stamp.width = 800;
      stamp.height = 440;
      const ctx = stamp.getContext("2d")!;
      const family =
        getComputedStyle(document.body).fontFamily || "Arial, sans-serif";

      // חתימה מצוירת — ממורכזת בחלק העליון
      const sigMaxW = 640;
      const sigMaxH = 240;
      const scale = Math.min(
        sigMaxW / sigCanvas.width,
        sigMaxH / sigCanvas.height
      );
      const sw = sigCanvas.width * scale;
      const sh = sigCanvas.height * scale;
      ctx.drawImage(sigCanvas, (800 - sw) / 2, 20 + (sigMaxH - sh) / 2, sw, sh);

      // קו הפרדה
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(120, 280);
      ctx.lineTo(680, 280);
      ctx.stroke();

      // טקסט בעברית — הדפדפן מרנדר RTL נכון, בניגוד ל-pdf-lib
      ctx.fillStyle = "#0f172a";
      ctx.textAlign = "center";
      ctx.font = `600 34px ${family}`;
      ctx.fillText(`נחתם דיגיטלית ע"י: ${name.trim()}`, 400, 335);
      ctx.fillStyle = "#475569";
      ctx.font = `400 26px ${family}`;
      const dateStr = new Date().toLocaleString("he-IL", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Asia/Jerusalem",
      });
      ctx.fillText(dateStr, 400, 385);

      const res = await fetch(`/api/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerName: name.trim(),
          stampPng: stamp.toDataURL("image/png"),
        }),
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.error ?? "שגיאה בשליחה, נסו שוב");
        return;
      }
      setDone(true);
    } catch {
      setError("שגיאה בשליחה, נסו שוב");
    } finally {
      setSubmitting(false);
    }
  }

  // ── מסכי מצב ───────────────────────────────────────────────
  const shell = (children: React.ReactNode) => (
    <div dir="rtl" className="min-h-screen bg-slate-100 flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-5">
          <div className="text-2xl font-bold text-slate-800">ברק שירותים</div>
          <div className="text-sm text-slate-500">חתימה דיגיטלית על מסמך</div>
        </div>
        {children}
      </div>
    </div>
  );

  if (!info) {
    return shell(
      <div className="bg-white rounded-2xl shadow p-8 text-center text-slate-500">
        טוען...
      </div>
    );
  }

  if (done || info.status === "signed") {
    return shell(
      <div className="bg-white rounded-2xl shadow p-8 text-center">
        <div className="text-5xl mb-3">✅</div>
        <div className="text-xl font-bold text-slate-800 mb-2">המסמך נחתם בהצלחה!</div>
        <div className="text-sm text-slate-500">
          העותק החתום נשמר אצלנו במערכת. תודה רבה 🙏
        </div>
      </div>
    );
  }

  if (info.status !== "pending") {
    const msg =
      info.status === "expired"
        ? "תוקף הקישור פג. פנו לרכזת כדי לקבל קישור חדש."
        : "הקישור לא תקין או שהבקשה בוטלה. פנו לרכזת לקבלת קישור חדש.";
    return shell(
      <div className="bg-white rounded-2xl shadow p-8 text-center">
        <div className="text-5xl mb-3">🔗</div>
        <div className="text-slate-700 font-semibold">{msg}</div>
      </div>
    );
  }

  const isImage = info.mime?.startsWith("image/");

  return shell(
    <div className="space-y-4">
      {/* המסמך */}
      <div className="bg-white rounded-2xl shadow p-4">
        <div className="font-bold text-slate-800 mb-1">
          {info.firstName ? `היי ${info.firstName}, ` : ""}מסמך לחתימתך: {info.docLabel}
        </div>
        <div className="text-xs text-slate-400 mb-3">{info.fileName}</div>

        {isImage ? (
          <img
            src={info.url}
            alt={info.docLabel}
            className="w-full rounded-lg border border-slate-200"
          />
        ) : (
          <>
            <iframe
              src={info.url}
              title={info.docLabel}
              className="w-full h-96 rounded-lg border border-slate-200 hidden sm:block"
            />
            <a
              href={info.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 rounded-xl bg-slate-800 text-white font-semibold sm:mt-2"
            >
              📄 פתיחת המסמך לקריאה
            </a>
          </>
        )}
      </div>

      {/* טופס החתימה */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            שם מלא
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="השם המלא שלך"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-base"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-semibold text-slate-700">
              חתימה (ציירו עם האצבע)
            </label>
            <button
              type="button"
              onClick={clearSignature}
              className="text-xs text-slate-500 underline"
            >
              נקה
            </button>
          </div>
          <canvas
            ref={setupCanvas}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="w-full h-40 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 touch-none"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 w-4 h-4"
          />
          <span>
            קראתי את המסמך ואני מאשר/ת את תוכנו. חתימתי הדיגיטלית מחייבת
            כחתימה בכתב יד.
          </span>
        </label>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || !hasDrawn || name.trim().length < 2 || !agreed}
          className="w-full py-3.5 rounded-xl bg-cyan-600 text-white text-lg font-bold disabled:opacity-40 active:bg-cyan-700 transition-colors"
        >
          {submitting ? "שולח..." : "✍️ חתימה ושליחה"}
        </button>
      </div>

      <div className="text-center text-[11px] text-slate-400 pb-4">
        המסמך החתום יישמר במערכת ברק שירותים · החתימה מתועדת עם תאריך ושעה
      </div>
    </div>
  );
}
