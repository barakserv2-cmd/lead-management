"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { Lead } from "@/types/leads";
import type { FinancialStatus } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { updateLeadNotes, updateLeadPreferences } from "../actions";

// ── Label maps ──────────────────────────────────────────────

const FINANCIAL_LABELS: Record<string, string> = {
  balanced: "מאוזן",
  delayed_payment: "עיכוב תשלום",
  debt: "חוב",
  bad_debt: "חוב אבוד",
};

const FINANCIAL_COLORS: Record<string, string> = {
  balanced: "bg-emerald-100 text-emerald-800 border-emerald-300",
  delayed_payment: "bg-amber-100 text-amber-800 border-amber-300",
  debt: "bg-red-100 text-red-800 border-red-300",
  bad_debt: "bg-red-200 text-red-900 border-red-400",
};

const CLIENT_TYPE_LABELS: Record<string, string> = {
  hotel: "מלון",
  restaurant: "מסעדה",
  construction: "בנייה",
  office: "משרד",
  other: "אחר",
};

const RECRUITMENT_LABELS: Record<string, string> = {
  active: "פעיל",
  frozen: "מוקפא",
  on_hold: "בהמתנה",
};

const RECRUITMENT_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 border-emerald-300",
  frozen: "bg-blue-100 text-blue-800 border-blue-300",
  on_hold: "bg-amber-100 text-amber-800 border-amber-300",
};

// ── Helpers ─────────────────────────────────────────────────

function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/[\s\-()]/g, "").replace(/^0/, "972");
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return name.slice(0, 2);
}

// ── Icons ───────────────────────────────────────────────────

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
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  const prefs = (lead.preferences ?? {}) as Record<string, string>;
  const [clientPrefs, setClientPrefs] = useState(prefs.client_preferences ?? "");
  const [pastIssues, setPastIssues] = useState(prefs.past_issues ?? "");
  const [savingPrefs, setSavingPrefs] = useState(false);

  const intlPhone = formatPhone(lead.phone);
  const financialColor = FINANCIAL_COLORS[lead.financial_status] ?? FINANCIAL_COLORS.balanced;
  const recruitmentColor = RECRUITMENT_COLORS[lead.recruitment_status] ?? RECRUITMENT_COLORS.active;
  const isFinancialAlert = lead.financial_status !== "balanced";

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

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-start gap-4">
          <span className="flex-shrink-0 w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
            {getInitials(lead.name)}
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              {lead.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge
                variant="outline"
                className={recruitmentColor}
              >
                {RECRUITMENT_LABELS[lead.recruitment_status] ?? lead.recruitment_status}
              </Badge>
              {lead.client_type && (
                <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300">
                  {CLIENT_TYPE_LABELS[lead.client_type] ?? lead.client_type}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={financialColor}
              >
                {isFinancialAlert && <AlertTriangleIcon className="w-3 h-3 ml-1" />}
                {FINANCIAL_LABELS[lead.financial_status] ?? lead.financial_status}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Bar ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        {intlPhone ? (
          <Button asChild size="lg" className="bg-green-600 hover:bg-green-700">
            <a
              href={"https://api.whatsapp.com/send?phone=" + intlPhone}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon className="w-5 h-5 ml-2" />
              WhatsApp
            </a>
          </Button>
        ) : (
          <Button size="lg" disabled className="bg-green-600">
            <WhatsAppIcon className="w-5 h-5 ml-2" />
            WhatsApp
          </Button>
        )}

        {lead.phone ? (
          <Button asChild size="lg" variant="outline">
            <a href={"tel:" + lead.phone}>
              <PhoneIcon className="w-5 h-5 ml-2" />
              התקשר
            </a>
          </Button>
        ) : (
          <Button size="lg" variant="outline" disabled>
            <PhoneIcon className="w-5 h-5 ml-2" />
            התקשר
          </Button>
        )}

        {lead.email ? (
          <Button asChild size="lg" variant="outline">
            <a href={"mailto:" + lead.email}>
              <MailIcon className="w-5 h-5 ml-2" />
              אימייל
            </a>
          </Button>
        ) : (
          <Button size="lg" variant="outline" disabled>
            <MailIcon className="w-5 h-5 ml-2" />
            אימייל
          </Button>
        )}

        <Button size="lg" variant="outline">
          <BriefcaseIcon className="w-5 h-5 ml-2" />
          משרה חדשה
        </Button>
      </div>

      {/* ── Main Grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Card 1: Business Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">פרטי עסק</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                  <PhoneIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium">טלפון</p>
                  <p className="text-sm font-medium text-gray-800" dir="ltr">
                    {lead.phone ?? "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
                  <MailIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium">אימייל</p>
                  <p className="text-sm font-medium text-gray-800" dir="ltr">
                    {lead.email ?? "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600">
                  <MapPinIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium">מיקום</p>
                  <p className="text-sm font-medium text-gray-800">
                    {lead.location ?? "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Financial Status Alert */}
            {isFinancialAlert && (
              <div className={`rounded-lg border p-3 ${FINANCIAL_COLORS[lead.financial_status]}`}>
                <div className="flex items-center gap-2">
                  <AlertTriangleIcon className="w-4 h-4 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold">התראת מצב פיננסי</p>
                    <p className="text-xs mt-0.5">
                      {FINANCIAL_LABELS[lead.financial_status]}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Operations */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">תפעול</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <BriefcaseIcon className="w-6 h-6 text-blue-600" />
                </div>
                <p className="text-3xl font-bold text-blue-700">
                  {lead.active_jobs_count}
                </p>
                <p className="text-xs text-blue-600 font-medium mt-1">משרות פעילות</p>
              </div>

              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <UsersIcon className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="text-3xl font-bold text-emerald-700">
                  {lead.active_employees_count}
                </p>
                <p className="text-xs text-emerald-600 font-medium mt-1">עובדים פעילים</p>
              </div>

              <div className="rounded-xl bg-violet-50 border border-violet-100 p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <ClipboardIcon className="w-6 h-6 text-violet-600" />
                </div>
                <p className="text-3xl font-bold text-violet-700">0</p>
                <p className="text-xs text-violet-600 font-medium mt-1">מועמדים</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Smart Notes */}
        <Card className="lg:row-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">הערות חכמות</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="general" dir="rtl">
              <TabsList className="w-full">
                <TabsTrigger value="general" className="flex-1 text-xs">
                  הערות כלליות
                </TabsTrigger>
                <TabsTrigger value="preferences" className="flex-1 text-xs">
                  העדפות
                </TabsTrigger>
                <TabsTrigger value="history" className="flex-1 text-xs">
                  היסטוריה
                </TabsTrigger>
              </TabsList>

              {/* General Notes Tab */}
              <TabsContent value="general" className="mt-3 space-y-3">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={6}
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

              {/* Preferences Tab */}
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

              {/* History Tab */}
              <TabsContent value="history" className="mt-3">
                <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                  <ClipboardIcon className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">אין היסטוריה עדיין</p>
                  <p className="text-xs mt-1">שינויי סטטוס ופעולות יופיעו כאן</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
