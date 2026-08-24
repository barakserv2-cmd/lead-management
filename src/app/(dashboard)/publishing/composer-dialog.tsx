"use client";

// ============================================================
// Composer — role → copy → groups → queue.
//
// The whole point of the variants step: every selected group gets a DIFFERENT
// rewrite. Pasting one text into eight Eilat job groups is what gets a profile
// throttled, and the same candidates sit in several of those groups.
// ============================================================

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Users, AlertTriangle, Clock, Plus, X } from "lucide-react";
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
import { cooldownLabel, similarity, DUPLICATE_THRESHOLD } from "@/lib/publishing";
import type { GroupWithStats, RoleTemplate } from "@/types/publishing";

export interface OpenJob {
  id: string;
  title: string;
  pay_rate: string | null;
  location: string | null;
  urgent: boolean;
  client_name: string | null;
}

interface Draft {
  title: string;
  body: string;
  variants: { label: string | null; body: string }[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: RoleTemplate[];
  groups: GroupWithStats[];
  openJobs: OpenJob[];
  /** preselected role when opened from a role card */
  initialRoleKey?: string | null;
  onQueued: () => void;
}

const ANGLES = ["שכר", "דיור", "התחלה מיידית", "בלי ניסיון", "חיים באילת"];

export function ComposerDialog({
  open,
  onOpenChange,
  templates,
  groups,
  openJobs,
  initialRoleKey,
  onQueued,
}: Props) {
  const [roleKey, setRoleKey] = useState<string | null>(initialRoleKey ?? null);
  const [jobId, setJobId] = useState<string>("");
  const [angle, setAngle] = useState<string>("");
  const [brief, setBrief] = useState("");
  const [variantCount, setVariantCount] = useState(3);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const role = templates.find((t) => t.role_key === roleKey) ?? null;

  const available = useMemo(
    () => groups.filter((g) => g.is_active && !g.cooldown_until),
    [groups]
  );
  const blocked = useMemo(
    () => groups.filter((g) => g.is_active && g.cooldown_until),
    [groups]
  );

  // Warn when a rewrite came back too close to the base copy — the model
  // sometimes just swaps synonyms, which defeats the purpose.
  const tooSimilar = useMemo(() => {
    if (!draft) return [];
    return draft.variants
      .map((v, i) => ({ i, score: similarity(draft.body, v.body) }))
      .filter((x) => x.score >= DUPLICATE_THRESHOLD);
  }, [draft]);

  function reset() {
    setRoleKey(initialRoleKey ?? null);
    setJobId("");
    setAngle("");
    setBrief("");
    setDraft(null);
    setSelected(new Set());
  }

  async function generate() {
    if (!roleKey && !jobId && !brief.trim()) {
      toast.error("בחר/י תפקיד, משרה או כתוב/כתבי בקשה חופשית");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/publishing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_key: roleKey ?? undefined,
          job_id: jobId || undefined,
          angle: angle || undefined,
          brief: brief.trim() || undefined,
          variants: variantCount,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "יצירת הפוסט נכשלה");
      setDraft({ title: json.title, body: json.body, variants: json.variants ?? [] });
      toast.success(`נוצרה מודעה + ${json.variants?.length ?? 0} וריאציות`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "יצירת הפוסט נכשלה");
    } finally {
      setGenerating(false);
    }
  }

  function toggleGroup(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function queue() {
    if (!draft?.body.trim()) return;
    if (selected.size === 0) {
      toast.error("לא נבחרו קבוצות");
      return;
    }
    setSaving(true);
    try {
      const postRes = await fetch("/api/publishing/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_key: roleKey,
          job_id: jobId || null,
          title: draft.title || role?.role_label || "מודעת דרושים",
          body: draft.body,
          angle: angle || null,
          status: "ready",
          variants: draft.variants,
        }),
      });
      const postJson = await postRes.json();
      if (!postRes.ok) throw new Error(postJson.error ?? "שמירת הפוסט נכשלה");

      const pubRes = await fetch("/api/publishing/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: postJson.post.id,
          group_ids: [...selected],
        }),
      });
      const pubJson = await pubRes.json();
      if (!pubRes.ok) throw new Error(pubJson.error ?? "הוספה לתור נכשלה");

      const added = pubJson.publications?.length ?? 0;
      const skipped = pubJson.blocked?.length ?? 0;
      toast.success(
        skipped
          ? `${added} קבוצות נכנסו לתור, ${skipped} בהמתנה (cooldown)`
          : `${added} קבוצות נכנסו לתור`
      );
      reset();
      onOpenChange(false);
      onQueued();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "הוספה לתור נכשלה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>מודעה חדשה לקבוצות פייסבוק</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── Step 1: what are we recruiting for ── */}
          <section className="space-y-2">
            <Label>תפקיד</Label>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.role_key}
                  type="button"
                  onClick={() => setRoleKey(roleKey === t.role_key ? null : t.role_key)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    roleKey === t.role_key
                      ? "bg-cyan-600 text-white border-cyan-600"
                      : "bg-white text-slate-700 border-slate-200 hover:border-cyan-400"
                  }`}
                >
                  {t.emoji ? `${t.emoji} ` : ""}
                  {t.role_label}
                </button>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="job">משרה מהמערכת (אופציונלי)</Label>
              <select
                id="job"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">בלי לשייך למשרה</option>
                {openJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.urgent ? "🔥 " : ""}
                    {j.title}
                    {j.client_name ? ` — ${j.client_name}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                שיוך למשרה מזרים שכר, מיקום ודרישות אמיתיים לתוך המודעה.
              </p>
            </div>

            <div className="space-y-2">
              <Label>זווית לפוסט הראשי</Label>
              <div className="flex flex-wrap gap-1.5">
                {ANGLES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAngle(angle === a ? "" : a)}
                    className={`px-2.5 py-1 rounded-md text-xs border ${
                      angle === a
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="brief">בקשה חופשית (אופציונלי)</Label>
            <textarea
              id="brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={2}
              placeholder="למשל: להדגיש דיור מסובסד ומשמרות בוקר בלבד"
              className="w-full rounded-md border border-slate-200 p-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={generate} disabled={generating} className="gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {draft ? "צור מחדש" : "צור מודעה"}
            </Button>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Label htmlFor="vc" className="text-sm font-normal">וריאציות</Label>
              <Input
                id="vc"
                type="number"
                min={0}
                max={8}
                value={variantCount}
                onChange={(e) => setVariantCount(Number(e.target.value))}
                className="w-16 h-8"
              />
            </div>
          </div>

          {/* ── Step 2: the copy ── */}
          {draft && (
            <section className="space-y-3 border-t border-slate-200 pt-4">
              <div className="space-y-2">
                <Label htmlFor="title">כותרת פנימית</Label>
                <Input
                  id="title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>מודעה ראשית</Label>
                <textarea
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  rows={9}
                  className="w-full rounded-md border border-slate-200 p-3 text-sm leading-relaxed"
                />
                <p className="text-[11px] text-slate-500">
                  קישור הוואטסאפ וקוד המשרה נוספים אוטומטית — קוד שונה לכל קבוצה.
                </p>
              </div>

              {draft.variants.map((v, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-slate-600">
                      וריאציה {i + 1}
                      {v.label ? ` — ${v.label}` : ""}
                    </Label>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({ ...draft, variants: draft.variants.filter((_, j) => j !== i) })
                      }
                      className="text-slate-400 hover:text-red-500"
                      aria-label="מחיקת וריאציה"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    value={v.body}
                    onChange={(e) => {
                      const variants = [...draft.variants];
                      variants[i] = { ...v, body: e.target.value };
                      setDraft({ ...draft, variants });
                    }}
                    rows={6}
                    className="w-full rounded-md border border-slate-200 p-3 text-sm leading-relaxed"
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setDraft({ ...draft, variants: [...draft.variants, { label: null, body: "" }] })
                }
                className="flex items-center gap-1.5 text-sm text-cyan-700 hover:text-cyan-800"
              >
                <Plus className="w-4 h-4" /> הוספת וריאציה ידנית
              </button>

              {tooSimilar.length > 0 && (
                <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    וריאציה {tooSimilar.map((x) => x.i + 1).join(", ")} כמעט זהה למודעה הראשית.
                    פייסבוק מזהה טקסט חוזר — שווה לשכתב או למחוק.
                  </span>
                </div>
              )}
            </section>
          )}

          {/* ── Step 3: where ── */}
          {draft && (
            <section className="space-y-2 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Users className="w-4 h-4" /> קבוצות ({selected.size} נבחרו)
                </Label>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(
                      selected.size === available.length
                        ? new Set()
                        : new Set(available.map((g) => g.id))
                    )
                  }
                  className="text-xs text-cyan-700 hover:underline"
                >
                  {selected.size === available.length ? "ניקוי בחירה" : "בחירת הכל"}
                </button>
              </div>

              {available.length === 0 && (
                <p className="text-sm text-slate-500">
                  אין קבוצות זמינות כרגע. הוסף/י קבוצות בלשונית &quot;הקבוצות שלי&quot;.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                {available.map((g) => (
                  <label
                    key={g.id}
                    className={`flex items-start gap-2 rounded-md border p-2.5 cursor-pointer text-sm ${
                      selected.has(g.id)
                        ? "border-cyan-500 bg-cyan-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(g.id)}
                      onChange={() => toggleGroup(g.id)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">{g.name}</span>
                      <span className="block text-[11px] text-slate-500">
                        {g.members ? `${g.members.toLocaleString("he-IL")} חברים` : "גודל לא ידוע"}
                        {g.requires_approval ? " · דורש אישור" : ""}
                      </span>
                      {g.rules && (
                        <span className="block text-[11px] text-amber-700 truncate" title={g.rules}>
                          ⚠ {g.rules}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>

              {blocked.length > 0 && (
                <div className="rounded-md bg-slate-50 border border-slate-200 p-2.5">
                  <p className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Clock className="w-3.5 h-3.5" />
                    בהמתנה (פרסמנו שם לאחרונה):{" "}
                    {blocked
                      .map((g) => `${g.name} (${cooldownLabel(g.cooldown_until) ?? "בקרוב"})`)
                      .join(" · ")}
                  </p>
                </div>
              )}
            </section>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={queue} disabled={!draft || saving || selected.size === 0} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            הוספה לתור ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
