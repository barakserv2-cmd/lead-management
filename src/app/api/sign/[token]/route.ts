// ============================================================
// דף החתימה הציבורי — ללא auth, מאובטח בטוקן חד-פעמי ארוך.
// GET  — פרטי הבקשה + קישור צפייה חתום למסמך
// POST — הגשת החתימה: הטבעה על ה-PDF, שמירת עותק חתום,
//        החלפת המקור וסגירת הבקשה.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { buildSignedPdf } from "@/lib/pdfSign";
import { LEAD_DOC_TYPES, type LeadDocType } from "@/lib/leadDocTypes";
import {
  CANDIDATE_FIELDS,
  RECRUITER_FIELDS,
  filterCandidateKeys,
  sanitizeCustomFields,
  sanitizeFieldPositions,
  sanitizeRecruiterValues,
  sanitizeRequiredFields,
  validateCandidateField,
  type CandidateFieldKey,
  type RecruiterFieldKey,
} from "@/lib/signatureTypes";

const BUCKET = "lead-documents";

function getAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface RequestRow {
  id: string;
  lead_id: string;
  document_id: string | null;
  status: string;
  doc_type: string;
  file_name: string;
  expires_at: string;
  required_fields: unknown;
  field_positions: unknown;
  recruiter_values: unknown;
  custom_fields: unknown;
  optional_fields: unknown;
}

async function loadRequest(token: string): Promise<RequestRow | null> {
  if (!token || token.length < 20 || token.length > 64) return null;
  const { data } = await getAdmin()
    .from("signature_requests")
    .select("id, lead_id, document_id, status, doc_type, file_name, expires_at, required_fields, field_positions, recruiter_values, custom_fields, optional_fields")
    .eq("token", token)
    .maybeSingle();
  return (data as RequestRow) ?? null;
}

/** ערכים ידועים מראש: פרטי הליד ב-CRM + פרטים שנשמרו מחתימות קודמות. */
async function loadPrefill(leadId: string): Promise<Record<string, string>> {
  const admin = getAdmin();
  const [{ data: lead }, { data: saved }] = await Promise.all([
    admin.from("leads").select("name, phone, email, location").eq("id", leadId).maybeSingle(),
    admin.from("lead_candidate_details").select("details").eq("lead_id", leadId).maybeSingle(),
  ]);
  const prefill: Record<string, string> = {};
  if (lead?.name) prefill.full_name = lead.name;
  if (lead?.phone) prefill.phone = lead.phone;
  if (lead?.email) prefill.email = lead.email;
  if (lead?.location) prefill.address = lead.location;
  // פרטים שהמועמד מילא בעצמו גוברים על נתוני הליד
  if (saved?.details && typeof saved.details === "object") {
    for (const [k, v] of Object.entries(saved.details as Record<string, unknown>)) {
      if (k in CANDIDATE_FIELDS && typeof v === "string" && v.trim()) prefill[k] = v;
    }
  }
  return prefill;
}

function isExpired(r: RequestRow): boolean {
  return new Date(r.expires_at).getTime() < Date.now();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const request = await loadRequest(token);
  if (!request || request.status === "cancelled") {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }
  if (request.status === "signed") {
    return NextResponse.json({ status: "signed" });
  }
  if (isExpired(request)) {
    return NextResponse.json({ status: "expired" });
  }

  const admin = getAdmin();
  const { data: doc } = await admin
    .from("lead_documents")
    .select("file_path, mime_type")
    .eq("id", request.document_id ?? "")
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, 60 * 60);
  if (!signed) {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  const requiredFields = sanitizeRequiredFields(request.required_fields);
  const optionalStd = filterCandidateKeys(request.optional_fields);
  const customs = sanitizeCustomFields(request.custom_fields);
  const recruiterVals = sanitizeRecruiterValues(
    request.recruiter_values,
    customs.filter((c) => c.filler === "recruiter").map((c) => c.key)
  );
  const prefill = await loadPrefill(request.lead_id);
  const firstName = (prefill.full_name ?? "").trim().split(/\s+/)[0] || null;

  return NextResponse.json({
    status: "pending",
    docLabel: LEAD_DOC_TYPES[request.doc_type as LeadDocType] ?? request.doc_type,
    fileName: request.file_name,
    mime: doc.mime_type,
    url: signed.signedUrl,
    firstName,
    expiresAt: request.expires_at,
    requiredFields: [
      ...requiredFields.map((key) => ({
        key,
        ...CANDIDATE_FIELDS[key],
        required: !optionalStd.includes(key),
      })),
      // שדות מותאמים שהמועמד ממלא — טקסט חופשי או שאלת סימון
      ...customs
        .filter((c) => c.filler === "candidate")
        .map((c) => ({
          key: c.key,
          label: c.label,
          type: c.type === "choice" ? ("choice" as const) : ("text" as const),
          options: c.options,
          required: c.required !== false,
        })),
    ],
    prefill: Object.fromEntries(
      requiredFields.filter((k) => prefill[k]).map((k) => [k, prefill[k]])
    ),
    fieldPositions: sanitizeFieldPositions(request.field_positions),
    recruiterInfo: Object.entries(recruiterVals).map(([key, value]) => {
      const def = customs.find((c) => c.key === key);
      return {
        key,
        label:
          key in RECRUITER_FIELDS
            ? RECRUITER_FIELDS[key as RecruiterFieldKey].label
            : def?.label ?? key,
        value,
        // אפשרויות לשאלת סימון — כדי שהלקוח ידע לאיזו משבצת שייך ה-✓
        options: def?.type === "choice" ? def.options : undefined,
      };
    }),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const request = await loadRequest(token);
  if (!request || request.status !== "pending" || isExpired(request)) {
    return NextResponse.json(
      { success: false, error: "הקישור כבר לא בתוקף" },
      { status: 410 }
    );
  }

  try {
    const { details, stampPng, detailsPng, fieldPngs } = await req.json();

    // ── ולידציה של כל שדות החובה (סטנדרטיים + מותאמים של מועמד) ──
    const customs = sanitizeCustomFields(request.custom_fields);
    const optionalStd = filterCandidateKeys(request.optional_fields);
    const candidateFieldList: { key: string; label: string; optional?: boolean }[] = [
      ...sanitizeRequiredFields(request.required_fields).map((key) => ({
        key: key as string,
        label: CANDIDATE_FIELDS[key].label,
        optional: optionalStd.includes(key),
      })),
      ...customs.filter((c) => c.filler === "candidate").map((c) => ({ key: c.key, label: c.label })),
    ];
    const values: Record<string, string> = {};
    for (const { key, label, optional } of candidateFieldList) {
      const raw = String((details ?? {})[key] ?? "").trim();
      const def = customs.find((c) => c.key === key);
      // שדה רשות שנשאר ריק — מדלגים (המשבצת תישאר ריקה בטופס)
      if ((optional || def?.required === false) && !raw) continue;
      // שאלת סימון: הערך חייב להיות אחת מהאפשרויות
      const err =
        def?.type === "choice"
          ? def.options!.includes(raw)
            ? null
            : "נא לבחור אפשרות"
          : validateCandidateField(key, raw);
      if (err) {
        return NextResponse.json(
          { success: false, error: `${label}: ${err}` },
          { status: 400 }
        );
      }
      values[key] = raw;
    }
    const name = values.full_name ?? "";
    if (!name) {
      return NextResponse.json({ success: false, error: "נא למלא שם מלא" }, { status: 400 });
    }

    function pngFrom(dataUrl: unknown): Buffer | null {
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ""));
      if (!m || m[1].length > 3_000_000) return null;
      return Buffer.from(m[1], "base64");
    }
    const stampBytes = pngFrom(stampPng);
    if (!stampBytes) {
      return NextResponse.json({ success: false, error: "חתימה לא תקינה" }, { status: 400 });
    }

    // ── מיפוי משבצות: הערכים מוטבעים בתוך הטופס עצמו ──
    const recruiterVals = sanitizeRecruiterValues(
      request.recruiter_values,
      customs.filter((c) => c.filler === "recruiter").map((c) => c.key)
    );
    // משבצות סימון: נשארת רק המשבצת של האפשרות שנבחרה
    const chosenIndex = (baseKey: string): number => {
      const def = customs.find((c) => c.key === baseKey && c.type === "choice");
      if (!def) return -1;
      const selected = def.filler === "candidate" ? values[baseKey] : recruiterVals[baseKey];
      return selected ? def.options!.indexOf(selected) : -1;
    };
    const placements = sanitizeFieldPositions(request.field_positions).filter((p) => {
      if (p.key === "signature" || p.key === "date") return true;
      const choiceMatch = /^(custom_[a-z0-9_]{1,40})__(\d{1,2})$/.exec(p.key);
      if (choiceMatch) {
        return chosenIndex(choiceMatch[1]) === Number(choiceMatch[2]);
      }
      // משבצת של שדה ערך (מועמד/רכזת) — רק אם יש ערך בפועל
      return !!(values[p.key] || recruiterVals[p.key]);
    });
    const overlayImages: Record<string, Uint8Array> = {};
    if (placements.length > 0) {
      const provided = (fieldPngs ?? {}) as Record<string, unknown>;
      for (const key of new Set(placements.map((p) => p.key))) {
        const bytes = pngFrom(provided[key]);
        if (!bytes) {
          return NextResponse.json(
            { success: false, error: "שגיאה בהרכבת המסמך — נסו שוב" },
            { status: 400 }
          );
        }
        overlayImages[key] = bytes;
      }
    }

    // עמוד פרטים נדרש רק כשאין מיפוי (אז הערכים מתועדים בעמוד נספח)
    const detailsBytes = pngFrom(detailsPng);
    if (placements.length === 0 && !detailsBytes) {
      return NextResponse.json({ success: false, error: "שגיאה בהרכבת דף הפרטים — נסו שוב" }, { status: 400 });
    }

    const admin = getAdmin();
    const { data: doc } = await admin
      .from("lead_documents")
      .select("id, file_path, file_name, mime_type, doc_type, lead_id")
      .eq("id", request.document_id ?? "")
      .maybeSingle();
    if (!doc) {
      return NextResponse.json({ success: false, error: "המסמך לא נמצא" }, { status: 404 });
    }

    const { data: blob, error: dlErr } = await admin.storage
      .from(BUCKET)
      .download(doc.file_path);
    if (dlErr || !blob) {
      return NextResponse.json({ success: false, error: "שגיאה בטעינת המסמך" }, { status: 500 });
    }
    const source = new Uint8Array(await blob.arrayBuffer());

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const signedAt = new Date();
    // Helvetica לא יודע עברית — שורת ה-audit בלטינית; העברית בחותמת ה-PNG
    const auditLine = `Digitally signed via Barak Services CRM | ${signedAt.toISOString()} | IP ${ip} | Ref ${request.id}`;

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildSignedPdf({
        source,
        mime: doc.mime_type ?? "application/pdf",
        stampPng: stampBytes,
        detailsPng: detailsBytes ?? undefined,
        overlays:
          placements.length > 0
            ? { placements, images: overlayImages }
            : undefined,
        auditLine,
      });
    } catch (e) {
      console.error("[Sign] PDF build failed:", e);
      return NextResponse.json(
        { success: false, error: "לא ניתן לעבד את המסמך — פנו לרכזת" },
        { status: 500 }
      );
    }

    const signedPath = `${doc.lead_id}/signed_${doc.doc_type}_${Date.now()}.pdf`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(signedPath, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (upErr) {
      return NextResponse.json({ success: false, error: "שגיאה בשמירת המסמך" }, { status: 500 });
    }

    const baseName = doc.file_name.replace(/\.[^.]+$/, "");
    const { data: signedDoc, error: insErr } = await admin
      .from("lead_documents")
      .insert({
        lead_id: doc.lead_id,
        doc_type: doc.doc_type,
        file_path: signedPath,
        file_name: `חתום - ${baseName}.pdf`,
        mime_type: "application/pdf",
        file_size: pdfBytes.length,
      })
      .select("id")
      .single();
    if (insErr || !signedDoc) {
      await admin.storage.from(BUCKET).remove([signedPath]);
      return NextResponse.json({ success: false, error: "שגיאה בשמירת המסמך" }, { status: 500 });
    }

    // העותק החתום מחליף את המקור (המקור כלול בתוך ה-PDF החתום)
    await admin.storage.from(BUCKET).remove([doc.file_path]);
    await admin.from("lead_documents").delete().eq("id", doc.id);

    await admin
      .from("signature_requests")
      .update({
        status: "signed",
        signed_document_id: signedDoc.id,
        signer_name: name,
        signer_ip: ip,
        signer_user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
        signed_at: signedAt.toISOString(),
        filled_details: { ...recruiterVals, ...values },
      })
      .eq("id", request.id);

    // הפרטים נשמרים לליד — השליחה הבאה תגיע ממולאת מראש.
    // רק שדות סטנדרטיים; מותאמים הם פר-תבנית ולא נגררים הלאה.
    const stdValues = Object.fromEntries(
      Object.entries(values).filter(([k]) => k in CANDIDATE_FIELDS)
    );
    const { data: existingDetails } = await admin
      .from("lead_candidate_details")
      .select("details")
      .eq("lead_id", doc.lead_id)
      .maybeSingle();
    await admin.from("lead_candidate_details").upsert({
      lead_id: doc.lead_id,
      details: { ...(existingDetails?.details as object ?? {}), ...stdValues },
      updated_at: signedAt.toISOString(),
    });
    // אימייל שמולא משלים חוסר בליד (לא דורס ערך קיים)
    if (values.email) {
      const { data: leadRow } = await admin.from("leads").select("email").eq("id", doc.lead_id).maybeSingle();
      if (leadRow && !leadRow.email) {
        await admin.from("leads").update({ email: values.email }).eq("id", doc.lead_id);
      }
    }

    const label = LEAD_DOC_TYPES[request.doc_type as LeadDocType] ?? request.doc_type;
    await admin.from("lead_events").insert({
      lead_id: doc.lead_id,
      event_type: "מסמכים",
      event_text: `נחתם דיגיטלית: ${label} — ע"י ${name}`,
      created_by: "חתימה דיגיטלית",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Sign Submit] Error:", err);
    return NextResponse.json(
      { success: false, error: "שגיאה לא צפויה" },
      { status: 500 }
    );
  }
}
