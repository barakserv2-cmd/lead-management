"use client";

// ============================================================
// "הקבוצות שלי" — the recruiter's own Facebook groups.
// She is a member of them; nobody else can post there on her behalf, so the
// inventory is per-recruiter (fb_groups.owner_email). Bulk paste exists
// because the realistic way to fill this is to copy a batch of group links
// straight out of the Facebook sidebar.
// ============================================================

import { useState } from "react";
import { toast } from "sonner";
import {
  Clock,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Power,
  Trash2,
  ClipboardList,
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
import { cooldownLabel } from "@/lib/publishing";
import type { GroupWithStats } from "@/types/publishing";

interface Props {
  groups: GroupWithStats[];
  onChanged: () => void;
}

const EMPTY = {
  name: "",
  url: "",
  members: "",
  category: "",
  cooldown_hours: 24,
  rules: "",
  requires_approval: false,
};

export function GroupsTab({ groups, onChanged }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<GroupWithStats | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [bulkText, setBulkText] = useState("");
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY });
    setDialogOpen(true);
  }

  function openEdit(g: GroupWithStats) {
    setEditing(g);
    setForm({
      name: g.name,
      url: g.url,
      members: g.members?.toString() ?? "",
      category: g.category ?? "",
      cooldown_hours: g.cooldown_hours,
      rules: g.rules ?? "",
      requires_approval: g.requires_approval,
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.name.trim() || !form.url.trim()) {
      toast.error("שם וקישור הם שדות חובה");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(editing ? { id: editing.id } : {}),
        name: form.name.trim(),
        url: form.url.trim(),
        members: form.members ? Number(form.members) : null,
        category: form.category.trim() || null,
        cooldown_hours: Number(form.cooldown_hours) || 24,
        rules: form.rules.trim() || null,
        requires_approval: form.requires_approval,
      };
      const res = await fetch("/api/publishing/groups", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "השמירה נכשלה");
      toast.success(editing ? "הקבוצה עודכנה" : "הקבוצה נוספה");
      setDialogOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  /** One group per line: "שם | קישור" (or just a link). */
  async function saveBulk() {
    const rows = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [a, b] = line.split("|").map((p) => p.trim());
        const url = b ?? a;
        const name = b ? a : a.replace(/^https?:\/\/(www\.)?facebook\.com\/groups\//, "").replace(/\/$/, "");
        return { name, url };
      })
      .filter((r) => r.url.includes("facebook.com") || r.url.startsWith("http"));

    if (rows.length === 0) {
      toast.error("לא זוהו קבוצות. פורמט: שם | קישור");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/publishing/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "הייבוא נכשל");
      toast.success(`${json.groups?.length ?? 0} קבוצות נוספו`);
      setBulkText("");
      setBulkOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "הייבוא נכשל");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(g: GroupWithStats) {
    const res = await fetch("/api/publishing/groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: g.id, is_active: !g.is_active }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error ?? "העדכון נכשל");
      return;
    }
    onChanged();
  }

  async function remove(g: GroupWithStats) {
    if (!confirm(`למחוק את "${g.name}"? היסטוריית הפרסומים בקבוצה תימחק גם היא.`)) return;
    const res = await fetch(`/api/publishing/groups?id=${g.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error ?? "המחיקה נכשלה");
      return;
    }
    toast.success("הקבוצה נמחקה");
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {groups.length} קבוצות · {groups.filter((g) => !g.cooldown_until && g.is_active).length} זמינות
          לפרסום עכשיו
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkOpen(true)} className="gap-2">
            <ClipboardList className="w-4 h-4" /> הדבקה מרוכזת
          </Button>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> קבוצה חדשה
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-600">עוד לא הוספת קבוצות.</p>
          <p className="mt-1 text-sm text-slate-500">
            פתח/י את פייסבוק, העתק/י את הקישורים לקבוצות הדרושים שאת/ה חבר/ה בהן, והדבק/י אותן כאן.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const cd = cooldownLabel(g.cooldown_until);
            return (
              <div
                key={g.id}
                className={`rounded-lg border bg-white p-4 ${
                  g.is_active ? "border-slate-200" : "border-slate-200 opacity-55"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-slate-800">{g.name}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {g.members ? `${g.members.toLocaleString("he-IL")} חברים` : "גודל לא ידוע"}
                      {g.category ? ` · ${g.category}` : ""}
                    </p>
                  </div>
                  <a
                    href={g.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-slate-400 hover:text-cyan-600"
                    aria-label="פתיחת הקבוצה"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {cd ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                      <Clock className="w-3 h-3" /> {cd}
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                      זמינה לפרסום
                    </span>
                  )}
                  <span className="text-slate-500">
                    {g.posts_count} פרסומים · {g.responses_total} פניות
                  </span>
                  {g.requires_approval && (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                      דורש אישור אדמין
                    </span>
                  )}
                </div>

                {g.rules && (
                  <p className="mt-2 rounded bg-amber-50 p-2 text-[11px] text-amber-800">⚠ {g.rules}</p>
                )}

                <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-3">
                  <button
                    onClick={() => openEdit(g)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    <Pencil className="w-3.5 h-3.5" /> עריכה
                  </button>
                  <button
                    onClick={() => toggleActive(g)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    <Power className="w-3.5 h-3.5" /> {g.is_active ? "השהיה" : "הפעלה"}
                  </button>
                  <button
                    onClick={() => remove(g)}
                    className="mr-auto flex items-center gap-1 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> מחיקה
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── single group ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת קבוצה" : "קבוצה חדשה"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="g-name">שם הקבוצה</Label>
              <Input
                id="g-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="דרושים אילת"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-url">קישור</Label>
              <Input
                id="g-url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://www.facebook.com/groups/..."
                dir="ltr"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="g-members">חברים</Label>
                <Input
                  id="g-members"
                  type="number"
                  value={form.members}
                  onChange={(e) => setForm({ ...form, members: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-cat">קטגוריה</Label>
                <Input
                  id="g-cat"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="דרושים / סטודנטים"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-cd">cooldown (שעות)</Label>
                <Input
                  id="g-cd"
                  type="number"
                  min={1}
                  value={form.cooldown_hours}
                  onChange={(e) => setForm({ ...form, cooldown_hours: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-rules">חוקי הקבוצה שכדאי לזכור</Label>
              <textarea
                id="g-rules"
                value={form.rules}
                onChange={(e) => setForm({ ...form, rules: e.target.value })}
                rows={2}
                placeholder="פוסט אחד ביום · אסור לינקים בגוף הפוסט"
                className="w-full rounded-md border border-slate-200 p-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.requires_approval}
                onChange={(e) => setForm({ ...form, requires_approval: e.target.checked })}
              />
              פוסטים בקבוצה עוברים אישור אדמין
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} שמירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── bulk paste ── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>הדבקה מרוכזת של קבוצות</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              שורה לכל קבוצה, בפורמט <span className="font-mono text-xs">שם | קישור</span>. אפשר גם
              להדביק קישורים בלבד.
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={9}
              dir="ltr"
              placeholder={"דרושים אילת | https://www.facebook.com/groups/123\nעבודה בדרום | https://www.facebook.com/groups/456"}
              className="w-full rounded-md border border-slate-200 p-2 font-mono text-xs"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              ביטול
            </Button>
            <Button onClick={saveBulk} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} ייבוא
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
