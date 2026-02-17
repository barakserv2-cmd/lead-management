"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import type { Lead } from "@/types/leads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  updateLeadNotes,
  updateLeadPreferences,
  updateLeadField,
  updateLeadDetails,
} from "../actions";
import { ConversationSheet } from "./conversation-sheet";

// ── Label / Color maps ──────────────────────────────────────

const FINANCIAL_OPTIONS = [
  { value: "balanced", label: "מאוזן", badge: "bg-emerald-500 text-white", alert: "" },
  { value: "delayed_payment", label: "עיכוב תשלום", badge: "bg-amber-500 text-white", alert: "bg-amber-50 border-amber-300 text-amber-800" },
  { value: "debt", label: "חוב", badge: "bg-red-600 text-white", alert: "bg-red-50 border-red-300 text-red-800" },
  { value: "bad_debt", label: "חוב אבוד", badge: "bg-red-800 text-white", alert: "bg-red-100 border-red-400 text-red-900" },
];

const CLIENT_TYPE_OPTIONS = [
  { value: "hotel", label: "מלון", badge: "bg-sky-100 text-sky-800" },
  { value: "restaurant", label: "מסעדה", badge: "bg-orange-100 text-orange-800" },
  { value: "construction", label: "בנייה", badge: "bg-yellow-100 text-yellow-800" },
  { value: "office", label: "משרד", badge: "bg-indigo-100 text-indigo-800" },
  { value: "other", label: "אחר", badge: "bg-gray-100 text-gray-700" },
];

// ── Helpers ──────────────────────────────────────────────────

function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/[\s\-()]/g, "").replace(/^0/, "972");
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return name.slice(0, 2);
}

// ── Editable Badge Dropdown ─────────────────────────────────

function EditableBadge({
  value,
  options,
  field,
  leadId,
}: {
  value: string | null;
  options: { value: string; label: string; badge: string }[];
  field: string;
  leadId: string;
}) {
  const [current, setCurrent] = useState(value);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = options.find((o) => o.value === current);
  const label = selected?.label ?? (current || "בחר");
  const color = selected?.badge ?? "bg-gray-100 text-gray-600";

  async function handleSelect(newValue: string) {
    setOpen(false);
    if (newValue === current) return;
    setCurrent(newValue);
    setSaving(true);
    const result = await updateLeadField(leadId, field, newValue);
    setSaving(false);
    if (result.error) {
      toast.error("שגיאה בעדכון");
      setCurrent(value);
    } else {
      toast.success("עודכן בהצלחה");
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${color} ${saving ? "opacity-50" : "hover:opacity-80"}`}
        disabled={saving}
      >
        {label}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 z-50 bg-white rounded-lg border shadow-lg py-1 min-w-[140px]">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={`w-full text-right px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${opt.value === current ? "font-bold" : ""}`}
              >
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${opt.badge.split(" ")[0]}`} />
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────

function PhoneIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function WhatsAppIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function MailIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function BriefcaseIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </svg>
  );
}

function MapPinIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function AlertTriangleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" /><path d="M12 17h.01" />
    </svg>
  );
}

function PencilIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    </svg>
  );
}

function ArrowRightIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function UsersIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" />
      <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
    </svg>
  );
}

function ClipboardIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

// ── Main Component ──────────────────────────────────────────

export function LeadDetail({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(lead.name);
  const [displayPhone, setDisplayPhone] = useState(lead.phone);
  const [displayEmail, setDisplayEmail] = useState(lead.email);
  const [displayJobTitle, setDisplayJobTitle] = useState(lead.job_title);

  const [notes, setNotes] = useState(lead.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  const prefs = (lead.preferences ?? {}) as Record<string, string>;
  const [clientPrefs, setClientPrefs] = useState(prefs.client_preferences ?? "");
  const [pastIssues, setPastIssues] = useState(prefs.past_issues ?? "");
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Conversation sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"call" | "whatsapp">("call");

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(lead.name);
  const [editPhone, setEditPhone] = useState(lead.phone ?? "");
  const [editEmail, setEditEmail] = useState(lead.email ?? "");
  const [editJobTitle, setEditJobTitle] = useState(lead.job_title ?? "");
  const [editLocation, setEditLocation] = useState(lead.location ?? "");
  const [editExperience, setEditExperience] = useState(lead.experience ?? "");
  const [editAge, setEditAge] = useState(lead.age?.toString() ?? "");
  const [savingEdit, setSavingEdit] = useState(false);

  const intlPhone = formatPhone(displayPhone);

  const financialOption = FINANCIAL_OPTIONS.find((o) => o.value === lead.financial_status);
  const isDebt = lead.financial_status === "debt" || lead.financial_status === "bad_debt";
  const isFinancialAlert = lead.financial_status !== "balanced";

  function openEditDialog() {
    setEditName(displayName);
    setEditPhone(displayPhone ?? "");
    setEditEmail(displayEmail ?? "");
    setEditJobTitle(displayJobTitle ?? "");
    setEditLocation(lead.location ?? "");
    setEditExperience(lead.experience ?? "");
    setEditAge(lead.age?.toString() ?? "");
    setEditOpen(true);
  }

  async function handleSaveDetails() {
    if (!editName.trim()) {
      toast.error("שם הוא שדה חובה");
      return;
    }
    setSavingEdit(true);
    const result = await updateLeadDetails(lead.id, {
      name: editName.trim(),
      phone: editPhone.trim(),
      email: editEmail.trim(),
      job_title: editJobTitle.trim(),
      location: editLocation.trim(),
      experience: editExperience.trim(),
      age: editAge.trim(),
    });
    setSavingEdit(false);
    if (result.error) {
      toast.error("שגיאה בעדכון הפרטים");
    } else {
      setDisplayName(editName.trim());
      setDisplayPhone(editPhone.trim() || null);
      setDisplayEmail(editEmail.trim() || null);
      setDisplayJobTitle(editJobTitle.trim() || null);
      setEditOpen(false);
      toast.success("הפרטים עודכנו!");
      router.refresh();
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    const result = await updateLeadNotes(lead.id, notes);
    setSavingNotes(false);
    if (result.error) toast.error("שגיאה בשמירה");
    else toast.success("הערות נשמרו!");
  }

  async function handleSavePreferences() {
    setSavingPrefs(true);
    const result = await updateLeadPreferences(lead.id, {
      ...prefs,
      client_preferences: clientPrefs,
      past_issues: pastIssues,
    });
    setSavingPrefs(false);
    if (result.error) toast.error("שגיאה בשמירה");
    else toast.success("העדפות נשמרו!");
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/leads"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
      >
        <ArrowRightIcon className="w-4 h-4" />
        חזרה לרשימה
      </Link>

      {/* ═══ HEADER ═══════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-start gap-4">
          <span className="flex-shrink-0 w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
            {getInitials(displayName)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-gray-900 truncate">
                {displayName}
              </h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={openEditDialog}
                className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 flex-shrink-0 gap-1"
                title="ערוך פרטים"
              >
                <PencilIcon className="w-4 h-4" />
                <span className="text-xs">עריכה</span>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <EditableBadge
                value={lead.client_type}
                options={CLIENT_TYPE_OPTIONS}
                field="client_type"
                leadId={lead.id}
              />
              <EditableBadge
                value={lead.financial_status}
                options={FINANCIAL_OPTIONS}
                field="financial_status"
                leadId={lead.id}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ═══ ACTION BAR ═══════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* WhatsApp — Green */}
        {intlPhone ? (
          <Button
            size="lg"
            className="h-14 text-base bg-green-600 hover:bg-green-700 text-white"
            onClick={() => {
              setSheetMode("whatsapp");
              setSheetOpen(true);
              setTimeout(() => {
                window.open("https://api.whatsapp.com/send?phone=" + intlPhone, "_blank", "noopener,noreferrer");
              }, 300);
            }}
          >
            <WhatsAppIcon className="w-5 h-5 ml-2" />
            WhatsApp
          </Button>
        ) : (
          <Button size="lg" disabled className="h-14 text-base bg-green-600 text-white">
            <WhatsAppIcon className="w-5 h-5 ml-2" />
            WhatsApp
          </Button>
        )}

        {/* Call — Blue */}
        {lead.phone ? (
          <Button
            size="lg"
            className="h-14 text-base bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => {
              setSheetMode("call");
              setSheetOpen(true);
              setTimeout(() => {
                const a = document.createElement("a");
                a.href = "tel:" + lead.phone;
                a.click();
              }, 300);
            }}
          >
            <PhoneIcon className="w-5 h-5 ml-2" />
            התקשר
          </Button>
        ) : (
          <Button size="lg" disabled className="h-14 text-base bg-blue-600 text-white">
            <PhoneIcon className="w-5 h-5 ml-2" />
            התקשר
          </Button>
        )}

        {/* Email — Gray */}
        {lead.email ? (
          <Button asChild size="lg" className="h-14 text-base bg-gray-600 hover:bg-gray-700 text-white">
            <a href={"mailto:" + lead.email}>
              <MailIcon className="w-5 h-5 ml-2" />
              אימייל
            </a>
          </Button>
        ) : (
          <Button size="lg" disabled className="h-14 text-base bg-gray-600 text-white">
            <MailIcon className="w-5 h-5 ml-2" />
            אימייל
          </Button>
        )}

        {/* New Job — Purple */}
        <Button size="lg" className="h-14 text-base bg-purple-600 hover:bg-purple-700 text-white">
          <BriefcaseIcon className="w-5 h-5 ml-2" />
          משרה חדשה
        </Button>
      </div>

      {/* ═══ MAIN 3-COLUMN GRID ══════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT: Contact Info + Financial Alert ────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">פרטי קשר</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                  <PhoneIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium">טלפון</p>
                  <p className="text-sm font-semibold text-gray-800" dir="ltr">
                    {displayPhone ?? "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
                  <MailIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium">אימייל</p>
                  <p className="text-sm font-semibold text-gray-800" dir="ltr">
                    {displayEmail ?? "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600">
                  <MapPinIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium">מיקום</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {lead.location ?? "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Financial Alert Box */}
            {isFinancialAlert && (
              <div className={`rounded-lg border-2 p-4 ${isDebt ? "bg-red-50 border-red-400" : "bg-amber-50 border-amber-300"}`}>
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${isDebt ? "bg-red-200 text-red-700" : "bg-amber-200 text-amber-700"}`}>
                    <AlertTriangleIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${isDebt ? "text-red-800" : "text-amber-800"}`}>
                      {isDebt ? "התראת חוב" : "התראה פיננסית"}
                    </p>
                    <p className={`text-xs mt-1 ${isDebt ? "text-red-700" : "text-amber-700"}`}>
                      מצב פיננסי: {financialOption?.label ?? lead.financial_status}
                    </p>
                    {isDebt && (
                      <p className="text-xs text-red-600 mt-1 font-medium">
                        יש לטפל בחוב לפני המשך שיבוצים
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── MIDDLE: Operations Stats ───────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">נתונים תפעוליים</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-5 text-center">
                <BriefcaseIcon className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <p className="text-4xl font-extrabold text-blue-700">
                  {lead.active_jobs_count}
                </p>
                <p className="text-sm text-blue-600 font-medium mt-1">משרות פעילות</p>
              </div>

              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center">
                <UsersIcon className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-4xl font-extrabold text-emerald-700">
                  {lead.active_employees_count}
                </p>
                <p className="text-sm text-emerald-600 font-medium mt-1">עובדים פעילים</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── RIGHT: Tabs — Notes / History / Preferences ─ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">מידע נוסף</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="notes" dir="rtl">
              <TabsList className="w-full">
                <TabsTrigger value="notes" className="flex-1 text-xs">
                  הערות
                </TabsTrigger>
                <TabsTrigger value="history" className="flex-1 text-xs">
                  היסטוריה
                </TabsTrigger>
                <TabsTrigger value="preferences" className="flex-1 text-xs">
                  העדפות
                </TabsTrigger>
              </TabsList>

              {/* Notes */}
              <TabsContent value="notes" className="mt-3 space-y-3">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={7}
                  className="resize-none text-sm"
                  placeholder="הערות כלליות על הלקוח..."
                />
                <Button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="w-full"
                  size="sm"
                >
                  {savingNotes ? "שומר..." : "שמור הערות"}
                </Button>
              </TabsContent>

              {/* History */}
              <TabsContent value="history" className="mt-3">
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <ClipboardIcon className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">אין היסטוריה עדיין</p>
                  <p className="text-xs mt-1">שינויי סטטוס ופעולות יופיעו כאן</p>
                </div>
              </TabsContent>

              {/* Preferences */}
              <TabsContent value="preferences" className="mt-3 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">
                    העדפות לקוח
                  </label>
                  <Textarea
                    value={clientPrefs}
                    onChange={(e) => setClientPrefs(e.target.value)}
                    rows={3}
                    className="resize-none text-sm"
                    placeholder='לדוגמה: "מעדיף עובדים עם ניסיון של 3+ שנים"'
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">
                    בעיות קודמות
                  </label>
                  <Textarea
                    value={pastIssues}
                    onChange={(e) => setPastIssues(e.target.value)}
                    rows={3}
                    className="resize-none text-sm"
                    placeholder='לדוגמה: "עיכובים בתשלום ברבעון 3"'
                  />
                </div>
                <Button
                  onClick={handleSavePreferences}
                  disabled={savingPrefs}
                  className="w-full"
                  size="sm"
                >
                  {savingPrefs ? "שומר..." : "שמור העדפות"}
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* ═══ EDIT DETAILS DIALOG ═══════════════════════════════ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת פרטי ליד</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">שם מלא *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="שם מלא"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">טלפון</Label>
              <Input
                id="edit-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="050-1234567"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">אימייל</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="email@example.com"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-job-title">תפקיד</Label>
              <Input
                id="edit-job-title"
                value={editJobTitle}
                onChange={(e) => setEditJobTitle(e.target.value)}
                placeholder="תפקיד נוכחי"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="edit-location">מיקום</Label>
                <Input
                  id="edit-location"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="עיר / אזור"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-age">גיל</Label>
                <Input
                  id="edit-age"
                  type="number"
                  min={1}
                  max={119}
                  value={editAge}
                  onChange={(e) => setEditAge(e.target.value)}
                  placeholder="גיל"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-experience">ניסיון</Label>
              <Input
                id="edit-experience"
                value={editExperience}
                onChange={(e) => setEditExperience(e.target.value)}
                placeholder="שנות ניסיון / תיאור"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={savingEdit}
            >
              ביטול
            </Button>
            <Button
              onClick={handleSaveDetails}
              disabled={savingEdit || !editName.trim()}
            >
              {savingEdit ? "שומר..." : "שמור שינויים"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ CONVERSATION SHEET ════════════════════════════════ */}
      <ConversationSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        lead={lead}
        mode={sheetMode}
      />
    </div>
  );
}
