"use client";

// דף חתימה ציבורי למועמד — מובייל-first, RTL.
// שלב 1: השלמת פרטים אישיים (ממולאים מראש מה-CRM כשידועים,
// חתימה נעולה עד שהכל תקין). שלב 2: ציור חתימה. הדפדפן מרכיב
// שני PNG — דף פרטים + חותמת — שהשרת מטביע על ה-PDF.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  validateCandidateField,
  type CandidateFieldKey,
  type FieldPlacement,
} from "@/lib/signatureTypes";

interface FieldInfo {
  key: CandidateFieldKey;
  label: string;
  type: "text" | "tel" | "email" | "date";
  numeric?: boolean;
}

interface DocInfo {
  status: "pending" | "signed" | "expired" | "not_found" | "error";
  docLabel?: string;
  fileName?: string;
  mime?: string;
  url?: string;
  firstName?: string | null;
  requiredFields?: FieldInfo[];
  prefill?: Record<string, string>;
  fieldPositions?: FieldPlacement[];
  /** תנאים שהרכזת מילאה (תפקיד/מקום/שכר) — לקריאה בלבד */
  recruiterInfo?: { key: string; label: string; value: string }[];
}

export function SignClient({ token }: { token: string }) {
  const [info, setInfo] = useState<DocInfo | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
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
      .then(async (r) => {
        const body = (await r.json()) as DocInfo;
        setInfo(body);
        if (body.prefill) setValues(body.prefill);
      })
      .catch(() => setInfo({ status: "error" }));
  }, [token]);

  const fields = useMemo(() => info?.requiredFields ?? [], [info]);

  const fieldErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    for (const f of fields) {
      const err = validateCandidateField(f.key, values[f.key] ?? "");
      if (err) errs[f.key] = err;
    }
    return errs;
  }, [fields, values]);

  const detailsComplete = Object.keys(fieldErrors).length === 0;
  const canSubmit = detailsComplete && hasDrawn && agreed && !submitting;

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
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  // ── הרכבת דף הפרטים + החותמת ושליחה ────────────────────────
  async function submit() {
    const sigCanvas = canvasRef.current;
    if (!sigCanvas || !canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const family = getComputedStyle(document.body).fontFamily || "Arial, sans-serif";
      const dateStr = new Date().toLocaleString("he-IL", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Asia/Jerusalem",
      });

      // דף פרטי המועמד — עברית מרונדרת בדפדפן
      const recruiterRows = info?.recruiterInfo ?? [];
      const details = document.createElement("canvas");
      details.width = 1000;
      const rowH = 74;
      details.height = 260 + (fields.length + recruiterRows.length) * rowH + 80;
      const dctx = details.getContext("2d")!;
      dctx.fillStyle = "#ffffff";
      dctx.fillRect(0, 0, details.width, details.height);
      dctx.direction = "rtl";
      dctx.textAlign = "center";
      dctx.fillStyle = "#0e7490";
      dctx.font = `bold 44px ${family}`;
      dctx.fillText("פרטי המועמד/ת", 500, 90);
      dctx.fillStyle = "#475569";
      dctx.font = `400 28px ${family}`;
      dctx.fillText(`${info?.docLabel ?? ""} · ${dateStr}`, 500, 140);
      dctx.strokeStyle = "#cbd5e1";
      dctx.lineWidth = 2;
      dctx.beginPath();
      dctx.moveTo(80, 175);
      dctx.lineTo(920, 175);
      dctx.stroke();
      let y = 250;
      for (const f of fields) {
        // תאריך מוצג dd/mm/yyyy
        let v = values[f.key]?.trim() ?? "";
        if (f.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const [yy, mm, dd] = v.split("-");
          v = `${dd}/${mm}/${yy}`;
        }
        dctx.textAlign = "right";
        dctx.fillStyle = "#64748b";
        dctx.font = `600 30px ${family}`;
        dctx.fillText(f.label + ":", 920, y);
        dctx.fillStyle = "#0f172a";
        dctx.font = `400 32px ${family}`;
        dctx.fillText(v, 660, y);
        y += rowH;
      }
      for (const r of recruiterRows) {
        dctx.textAlign = "right";
        dctx.fillStyle = "#64748b";
        dctx.font = `600 30px ${family}`;
        dctx.fillText(r.label + ":", 920, y);
        dctx.fillStyle = "#0f172a";
        dctx.font = `400 32px ${family}`;
        dctx.fillText(r.value, 660, y);
        y += rowH;
      }

      // חותמת חתימה
      const stamp = document.createElement("canvas");
      stamp.width = 800;
      stamp.height = 440;
      const ctx = stamp.getContext("2d")!;
      const sigMaxW = 640;
      const sigMaxH = 240;
      const scale = Math.min(sigMaxW / sigCanvas.width, sigMaxH / sigCanvas.height);
      const sw = sigCanvas.width * scale;
      const sh = sigCanvas.height * scale;
      ctx.drawImage(sigCanvas, (800 - sw) / 2, 20 + (sigMaxH - sh) / 2, sw, sh);
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(120, 280);
      ctx.lineTo(680, 280);
      ctx.stroke();
      ctx.fillStyle = "#0f172a";
      ctx.textAlign = "center";
      ctx.font = `600 34px ${family}`;
      ctx.fillText(`נחתם דיגיטלית ע"י: ${values.full_name?.trim() ?? ""}`, 400, 335);
      ctx.fillStyle = "#475569";
      ctx.font = `400 26px ${family}`;
      ctx.fillText(dateStr, 400, 385);

      // ── ערכים ממופים לתוך הטופס: PNG שקוף לכל מפתח ──
      const fieldPngs: Record<string, string> = {};
      const positionedKeys = new Set(
        (info?.fieldPositions ?? []).map((p) => p.key)
      );
      const displayValue = (key: string): string => {
        if (key === "date") {
          return new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
        }
        const recruiterVal = info?.recruiterInfo?.find((r) => r.key === key)?.value;
        if (recruiterVal) return recruiterVal;
        let v = values[key]?.trim() ?? "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const [yy, mm, dd] = v.split("-");
          v = `${dd}/${mm}/${yy}`;
        }
        return v;
      };
      // חיתוך החתימה לגבולות הדיו — אחרת היא מוטבעת מוקטנת עם שוליים ריקים
      const cropSignature = (): string => {
        const ctx2 = sigCanvas.getContext("2d")!;
        const { width: cw, height: ch } = sigCanvas;
        const data = ctx2.getImageData(0, 0, cw, ch).data;
        let minX = cw, minY = ch, maxX = 0, maxY = 0;
        for (let py = 0; py < ch; py++) {
          for (let px = 0; px < cw; px++) {
            if (data[(py * cw + px) * 4 + 3] > 0) {
              if (px < minX) minX = px;
              if (px > maxX) maxX = px;
              if (py < minY) minY = py;
              if (py > maxY) maxY = py;
            }
          }
        }
        if (maxX <= minX || maxY <= minY) return sigCanvas.toDataURL("image/png");
        const pad = 6;
        minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
        maxX = Math.min(cw - 1, maxX + pad); maxY = Math.min(ch - 1, maxY + pad);
        const c = document.createElement("canvas");
        c.width = maxX - minX + 1;
        c.height = maxY - minY + 1;
        c.getContext("2d")!.drawImage(sigCanvas, minX, minY, c.width, c.height, 0, 0, c.width, c.height);
        return c.toDataURL("image/png");
      };

      for (const key of positionedKeys) {
        if (key === "signature") {
          fieldPngs[key] = cropSignature();
          continue;
        }
        const text = displayValue(key);
        const c = document.createElement("canvas");
        const tctx = c.getContext("2d")!;
        const fontSpec = `500 56px ${family}`;
        tctx.font = fontSpec;
        const tw = Math.ceil(tctx.measureText(text).width);
        c.width = Math.max(tw + 16, 24);
        c.height = 80;
        const cctx = c.getContext("2d")!;
        cctx.direction = "rtl";
        cctx.font = fontSpec;
        cctx.fillStyle = "#111827";
        cctx.textAlign = "right";
        cctx.textBaseline = "middle";
        cctx.fillText(text, c.width - 8, 42);
        fieldPngs[key] = c.toDataURL("image/png");
      }

      const res = await fetch(`/api/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          details: Object.fromEntries(fields.map((f) => [f.key, values[f.key]?.trim() ?? ""])),
          stampPng: stamp.toDataURL("image/png"),
          detailsPng: details.toDataURL("image/png"),
          fieldPngs: positionedKeys.size > 0 ? fieldPngs : undefined,
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
  const missingCount = Object.keys(fieldErrors).length;

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

      {/* שלב 1 — פרטים אישיים */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-bold text-slate-800">הפרטים שלך</div>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
              detailsComplete ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {detailsComplete ? "✓ הכל מלא" : `חסרים ${missingCount} שדות`}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 -mt-1">
          הפרטים ייכנסו למסמך החתום. בדקו שהכל נכון והשלימו את החסר.
        </p>

        {(info.recruiterInfo?.length ?? 0) > 0 && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 space-y-1">
            {info.recruiterInfo!.map((r) => (
              <div key={r.key} className="flex justify-between text-sm">
                <span className="text-slate-500">{r.label}</span>
                <span className="font-semibold text-slate-800">{r.value}</span>
              </div>
            ))}
          </div>
        )}

        {fields.map((f) => {
          const err = touched.has(f.key) ? fieldErrors[f.key] : undefined;
          const filled = !fieldErrors[f.key];
          return (
            <div key={f.key}>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {f.label}
                {filled && <span className="text-green-600 mr-1">✓</span>}
              </label>
              <input
                type={f.type}
                inputMode={f.numeric ? "numeric" : undefined}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                onBlur={() => setTouched((t) => new Set(t).add(f.key))}
                placeholder={f.label}
                className={`w-full px-3 py-2.5 rounded-xl border text-base focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  err ? "border-red-400 bg-red-50/40" : "border-slate-300"
                }`}
              />
              {err && <div className="text-[11px] text-red-600 mt-0.5">{err}</div>}
            </div>
          );
        })}
      </div>

      {/* שלב 2 — חתימה (נעול עד שהפרטים מלאים) */}
      <div
        className={`bg-white rounded-2xl shadow p-4 space-y-4 transition-opacity ${
          detailsComplete ? "" : "opacity-50 pointer-events-none select-none"
        }`}
      >
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-semibold text-slate-700">
              {detailsComplete ? "חתימה (ציירו עם האצבע)" : "🔒 חתימה — קודם משלימים פרטים"}
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
            קראתי את המסמך, הפרטים שמילאתי נכונים, ואני מאשר/ת את תוכנו.
            חתימתי הדיגיטלית מחייבת כחתימה בכתב יד.
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
          disabled={!canSubmit}
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
