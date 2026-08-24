"use client";

// ============================================================
// /publishing — organic posting to Facebook job groups.
//
// Facebook killed the Groups publishing API in April 2024, so the CRM cannot
// press "post" for anyone. What it CAN do is remove every other minute of the
// job: write the copy, give each group its own rewrite and its own tracking
// code, keep each group's cooldown, and hand the recruiter a one-click
// "copy + open the group". She pastes, she posts, she marks it done.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Check,
  ClipboardCopy,
  Clock,
  ExternalLink,
  Loader2,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Send,
  SkipForward,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GroupsTab } from "./groups-tab";
import { ComposerDialog, type OpenJob } from "./composer-dialog";
import { cooldownLabel } from "@/lib/publishing";
import type {
  GroupWithStats,
  PublicationWithRefs,
  PublishingSettings,
  RoleTemplate,
} from "@/types/publishing";

type Tab = "queue" | "groups" | "roles" | "stats";

const TAB_LABELS: Record<Tab, string> = {
  queue: "תור פרסום",
  groups: "הקבוצות שלי",
  roles: "תפקידים קבועים",
  stats: "ביצועים",
};

interface Props {
  userEmail: string;
  userName: string | null;
  isAdmin: boolean;
  openJobs: OpenJob[];
}

export function PublishingContent({ userEmail, userName, isAdmin, openJobs }: Props) {
  const [tab, setTab] = useState<Tab>("queue");
  const [groups, setGroups] = useState<GroupWithStats[]>([]);
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [publications, setPublications] = useState<PublicationWithRefs[]>([]);
  const [settings, setSettings] = useState<PublishingSettings | null>(null);
  /** the signed-in recruiter's own linked WhatsApp number — what her posts carry */
  const [myPhone, setMyPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerRole, setComposerRole] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, t, p, s] = await Promise.all([
        fetch("/api/publishing/groups").then((r) => r.json()),
        fetch("/api/publishing/templates").then((r) => r.json()),
        fetch("/api/publishing/publications").then((r) => r.json()),
        fetch("/api/publishing/settings").then((r) => r.json()),
      ]);
      if (g.error || t.error || p.error) {
        toast.error(g.error ?? t.error ?? p.error);
      }
      setGroups(g.groups ?? []);
      setTemplates(t.templates ?? []);
      setPublications(p.publications ?? []);
      setSettings(s.settings ?? null);
      setMyPhone(s.my_phone ?? null);
    } catch {
      toast.error("טעינת נתוני הפרסום נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const queued = useMemo(
    () => publications.filter((p) => p.status === "queued"),
    [publications]
  );
  const posted = useMemo(
    () => publications.filter((p) => p.status === "posted"),
    [publications]
  );

  // A post carries the posting recruiter's own number; the shared one is only
  // the fallback for a recruiter who hasn't linked hers under /settings/whatsapp.
  const effectivePhone = myPhone ?? settings?.contact_phone ?? null;
  const missingPhone = !effectivePhone;

  async function patchPublication(id: string, patch: Record<string, unknown>) {
    const res = await fetch("/api/publishing/publications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "העדכון נכשל");
      return null;
    }
    setPublications((prev) => prev.map((p) => (p.id === id ? json.publication : p)));
    return json.publication as PublicationWithRefs;
  }

  async function copyAndOpen(pub: PublicationWithRefs) {
    try {
      await navigator.clipboard.writeText(pub.body_snapshot);
      toast.success("הטקסט הועתק — מדביקים בקבוצה");
    } catch {
      toast.error("ההעתקה נכשלה. סמן/י את הטקסט והעתק/י ידנית.");
    }
    if (pub.fb_groups?.url) window.open(pub.fb_groups.url, "_blank", "noopener");
  }

  async function markPosted(pub: PublicationWithRefs) {
    const updated = await patchPublication(pub.id, { status: "posted" });
    if (updated) {
      toast.success(`סומן כפורסם — ${pub.fb_groups?.name ?? "הקבוצה"}`);
      // The group's cooldown just started; refresh so the queue reflects it.
      void load();
    }
  }

  async function skip(pub: PublicationWithRefs) {
    const updated = await patchPublication(pub.id, { status: "skipped" });
    if (updated) toast.success("דולג");
  }

  async function removeQueued(pub: PublicationWithRefs) {
    const res = await fetch(`/api/publishing/publications?id=${pub.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("המחיקה נכשלה");
      return;
    }
    setPublications((prev) => prev.filter((p) => p.id !== pub.id));
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* ── header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">פרסום אורגני בפייסבוק</h1>
          <p className="mt-1 text-sm text-slate-600">
            {userName ? `${userName} · ` : ""}
            {groups.length} קבוצות · {queued.length} ממתינים לפרסום
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSettingsOpen(true)} className="gap-2">
            <Phone className="w-4 h-4" />
            {effectivePhone ? (
              <span dir="ltr" className="font-mono text-xs">
                {effectivePhone}
              </span>
            ) : (
              "מספר לפניות"
            )}
          </Button>
          <Button variant="outline" onClick={() => void load()} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> רענון
          </Button>
          <Button
            onClick={() => {
              setComposerRole(null);
              setComposerOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" /> מודעה חדשה
          </Button>
        </div>
      </div>

      {/* Facebook has no group-publishing API — say so once, plainly, instead of
          letting the recruiter wait for an "auto-post" that will never come. */}
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
        <Send className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <span>
          פייסבוק לא מאפשרת פרסום אוטומטי בקבוצות (ה-API בוטל ב-2024). המערכת כותבת, מנהלת תור
          ושומרת מרווחים — ההדבקה עצמה נעשית מהפרופיל שלך, בקבוצות שאת/ה חבר/ה בהן.
        </span>
      </div>

      {missingPhone ? (
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-right text-sm text-amber-800"
        >
          <Phone className="h-4 w-4 shrink-0" />
          אין מספר וואטסאפ לפניות — בלעדיו המודעות ייצאו בלי קישור יצירת קשר. חברו את המספר שלכם
          תחת הגדרות ← וואטסאפ, או הגדירו מספר משותף כאן.
        </button>
      ) : (
        <p className="text-xs text-slate-500">
          המודעות שלך יוצאות עם המספר{" "}
          <span dir="ltr" className="font-mono">
            {effectivePhone}
          </span>
          {myPhone
            ? " — המספר האישי שלך. מי שיכתוב יגיע ישירות אלייך."
            : " (מספר משותף — עוד לא חיברת מספר אישי תחת הגדרות ← וואטסאפ)."}
        </p>
      )}

      {/* ── tabs ── */}
      <div className="flex gap-1 border-b border-slate-200">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-b-2 border-cyan-500 text-cyan-700"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {TAB_LABELS[t]}
            {t === "queue" && queued.length > 0 && (
              <span className="mr-1.5 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[11px] text-cyan-700">
                {queued.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && publications.length === 0 && groups.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          {tab === "queue" && (
            <QueueTab
              queued={queued}
              posted={posted}
              onCopyOpen={copyAndOpen}
              onPosted={markPosted}
              onSkip={skip}
              onRemove={removeQueued}
              onPatch={patchPublication}
              onNew={() => {
                setComposerRole(null);
                setComposerOpen(true);
              }}
            />
          )}

          {tab === "groups" && <GroupsTab groups={groups} onChanged={load} />}

          {tab === "roles" && (
            <RolesTab
              templates={templates}
              publications={publications}
              onCompose={(roleKey) => {
                setComposerRole(roleKey);
                setComposerOpen(true);
              }}
            />
          )}

          {tab === "stats" && <StatsTab groups={groups} publications={posted} templates={templates} />}
        </>
      )}

      <ComposerDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        templates={templates}
        groups={groups}
        openJobs={openJobs}
        initialRoleKey={composerRole}
        onQueued={() => {
          setTab("queue");
          void load();
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        myPhone={myPhone}
        isAdmin={isAdmin}
        userEmail={userEmail}
        onSaved={(s) => setSettings(s)}
      />
    </div>
  );
}

// ── Queue ───────────────────────────────────────────────────

function QueueTab({
  queued,
  posted,
  onCopyOpen,
  onPosted,
  onSkip,
  onRemove,
  onPatch,
  onNew,
}: {
  queued: PublicationWithRefs[];
  posted: PublicationWithRefs[];
  onCopyOpen: (p: PublicationWithRefs) => void;
  onPosted: (p: PublicationWithRefs) => void;
  onSkip: (p: PublicationWithRefs) => void;
  onRemove: (p: PublicationWithRefs) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<PublicationWithRefs | null>;
  onNew: () => void;
}) {
  if (queued.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-slate-600">התור ריק.</p>
        <p className="mt-1 text-sm text-slate-500">
          בוחרים תפקיד, יוצרים מודעה, מסמנים קבוצות — וכל קבוצה מקבלת נוסח משלה.
        </p>
        <Button onClick={onNew} className="mt-4 gap-2">
          <Plus className="h-4 w-4" /> מודעה חדשה
        </Button>
        {posted.length > 0 && <RecentlyPosted posted={posted} onPatch={onPatch} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        {queued.map((p) => (
          <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-800">
                  {p.fb_groups?.name ?? "קבוצה שנמחקה"}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {p.fb_posts?.title ?? ""} · קוד {p.tracking_code}
                </p>
              </div>
              <button
                onClick={() => onRemove(p)}
                className="shrink-0 text-slate-300 hover:text-red-500"
                aria-label="הסרה מהתור"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {p.fb_groups?.rules && (
              <p className="mt-2 rounded bg-amber-50 p-2 text-[11px] text-amber-800">
                ⚠ {p.fb_groups.rules}
              </p>
            )}

            <pre className="mt-3 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-sans text-[13px] leading-relaxed text-slate-700">
              {p.body_snapshot}
            </pre>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => onCopyOpen(p)} className="gap-1.5">
                <ClipboardCopy className="h-3.5 w-3.5" />
                העתקה + פתיחת הקבוצה
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => onPosted(p)} className="gap-1.5">
                <Check className="h-3.5 w-3.5" /> פורסם
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onSkip(p)} className="gap-1.5">
                <SkipForward className="h-3.5 w-3.5" /> דילוג
              </Button>
            </div>
          </div>
        ))}
      </div>

      {posted.length > 0 && <RecentlyPosted posted={posted} onPatch={onPatch} />}
    </div>
  );
}

/** Posted rows stay editable: the FB link and the "how many wrote in" count
 *  are what turn this module into something measurable. */
function RecentlyPosted({
  posted,
  onPatch,
}: {
  posted: PublicationWithRefs[];
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<PublicationWithRefs | null>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">פורסמו לאחרונה</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {posted.slice(0, 12).map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate text-slate-700">
              {p.fb_groups?.name ?? "—"}
              <span className="mr-2 text-xs text-slate-400">{p.fb_posts?.title}</span>
            </span>
            <span className="text-xs text-slate-400">
              {p.posted_at ? new Date(p.posted_at).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
              {p.tracking_code}
            </span>
            <div className="flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="number"
                min={0}
                defaultValue={p.responses}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== p.responses) void onPatch(p.id, { responses: v });
                }}
                className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-xs"
                aria-label="פניות שהתקבלו"
              />
            </div>
            <input
              type="url"
              dir="ltr"
              defaultValue={p.post_url ?? ""}
              placeholder="קישור לפוסט"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (p.post_url ?? "")) void onPatch(p.id, { post_url: v || null });
              }}
              className="w-44 rounded border border-slate-200 px-2 py-0.5 text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Roles ───────────────────────────────────────────────────

function RolesTab({
  templates,
  publications,
  onCompose,
}: {
  templates: RoleTemplate[];
  publications: PublicationWithRefs[];
  onCompose: (roleKey: string) => void;
}) {
  const countByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of publications) {
      const key = p.fb_posts?.role_key;
      if (key) m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [publications]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        שבעת התפקידים שחוזרים על עצמם. לחיצה פותחת מודעה חדשה עם הנתונים של התפקיד — כל פעם בנוסח
        חדש, לא אותו פוסט מועתק.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {templates.map((t) => (
          <button
            key={t.role_key}
            onClick={() => onCompose(t.role_key)}
            className="rounded-lg border border-slate-200 bg-white p-4 text-right transition-colors hover:border-cyan-400 hover:shadow-sm"
          >
            <div className="text-2xl">{t.emoji ?? "📣"}</div>
            <h3 className="mt-2 font-semibold text-slate-800">{t.role_label}</h3>
            {t.headline && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{t.headline}</p>}
            <p className="mt-3 text-[11px] text-slate-400">
              {countByRole.get(t.role_key) ?? 0} פרסומים עד היום
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Stats ───────────────────────────────────────────────────

function StatsTab({
  groups,
  publications,
  templates,
}: {
  groups: GroupWithStats[];
  publications: PublicationWithRefs[];
  templates: RoleTemplate[];
}) {
  const byRole = useMemo(() => {
    const m = new Map<string, { posts: number; responses: number }>();
    for (const p of publications) {
      const key = p.fb_posts?.role_key ?? "__none__";
      const row = m.get(key) ?? { posts: 0, responses: 0 };
      row.posts += 1;
      row.responses += p.responses ?? 0;
      m.set(key, row);
    }
    return m;
  }, [publications]);

  const totalResponses = publications.reduce((s, p) => s + (p.responses ?? 0), 0);
  const ranked = [...groups].sort((a, b) => b.responses_total - a.responses_total);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={<Send className="h-4 w-4" />} label="פרסומים" value={publications.length} />
        <StatCard icon={<MessageSquare className="h-4 w-4" />} label="פניות שהתקבלו" value={totalResponses} />
        <StatCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="פניות לפרסום"
          value={publications.length ? (totalResponses / publications.length).toFixed(1) : "0"}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Users className="h-4 w-4" /> לפי קבוצה
          </h3>
        </div>
        {ranked.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">אין עדיין נתונים.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {ranked.map((g) => (
              <div key={g.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-700">{g.name}</span>
                <span className="text-xs text-slate-500">{g.posts_count} פרסומים</span>
                <span className="w-24 text-left text-xs font-medium text-slate-700">
                  {g.responses_total} פניות
                </span>
                <span className="w-20 text-left text-xs text-slate-400">
                  {g.cooldown_until ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {cooldownLabel(g.cooldown_until)}
                    </span>
                  ) : (
                    "זמינה"
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">לפי תפקיד</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {templates.map((t) => {
            const row = byRole.get(t.role_key);
            return (
              <div key={t.role_key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 text-slate-700">
                  {t.emoji} {t.role_label}
                </span>
                <span className="text-xs text-slate-500">{row?.posts ?? 0} פרסומים</span>
                <span className="w-24 text-left text-xs font-medium text-slate-700">
                  {row?.responses ?? 0} פניות
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

// ── Settings ────────────────────────────────────────────────

function SettingsDialog({
  open,
  onOpenChange,
  settings,
  myPhone,
  isAdmin,
  userEmail,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  settings: PublishingSettings | null;
  myPhone: string | null;
  isAdmin: boolean;
  userEmail: string;
  onSaved: (s: PublishingSettings) => void;
}) {
  const [phone, setPhone] = useState(settings?.contact_phone ?? "");
  const [name, setName] = useState(settings?.contact_name ?? "");
  const [signature, setSignature] = useState(settings?.signature ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPhone(settings?.contact_phone ?? "");
    setName(settings?.contact_name ?? "");
    setSignature(settings?.signature ?? "");
  }, [settings]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/publishing/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_phone: phone, contact_name: name, signature }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "השמירה נכשלה");
      onSaved(json.settings);
      toast.success("נשמר");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>יצירת קשר במודעות</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div
            className={`rounded-md border p-3 text-sm ${
              myPhone
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {myPhone ? (
              <>
                <p className="font-medium">
                  המודעות שלך יוצאות עם{" "}
                  <span dir="ltr" className="font-mono">
                    {myPhone}
                  </span>
                </p>
                <p className="mt-1 text-[11px]">
                  זה המספר האישי שחיברת תחת הגדרות ← וואטסאפ. כל מי שיפנה מהפוסטים שלך יגיע אלייך,
                  ולא לרכזת אחרת.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">עוד לא חיברת מספר וואטסאפ אישי</p>
                <p className="mt-1 text-[11px]">
                  חברי את המספר שלך תחת הגדרות ← וואטסאפ, ואז הפוסטים שלך יפנו אלייך. עד אז ישמש
                  המספר המשותף שלמטה.
                </p>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="s-phone">מספר משותף (גיבוי)</Label>
            <Input
              id="s-phone"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05X-XXXXXXX"
            />
            <p className="text-[11px] text-slate-500">
              משמש רק לרכזות שאין להן מספר אישי מחובר. בכל מקרה כל מודעה מקבלת קוד מעקב ייחודי לכל
              קבוצה — כך רואים מאיזו קבוצה הגיע כל מועמד.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-name">שם איש הקשר (אופציונלי)</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-sig">חתימה קבועה (אופציונלי)</Label>
            <textarea
              id="s-sig"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              rows={2}
              placeholder="ברק שירותים — השמה לאירוח באילת"
              className="w-full rounded-md border border-slate-200 p-2 text-sm"
            />
          </div>
          {!isAdmin && (
            <p className="text-[11px] text-slate-400">
              ההגדרה משותפת לכל הרכזות. מחובר/ת כ-{userEmail}.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} שמירה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
