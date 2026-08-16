"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  createUser,
  updateUser,
  deleteUser,
  type UserProfile,
} from "./actions";

const ROLES = [
  { value: "מגייס", label: "מגייס" },
  { value: "אדמין", label: "אדמין" },
];

export function UsersContent({ users: initialUsers }: { users: UserProfile[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState("מגייס");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Password reset dialog state
  const [pwUser, setPwUser] = useState<UserProfile | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwDone, setPwDone] = useState(false);

  function openPasswordDialog(user: UserProfile) {
    setPwUser(user);
    setPwValue("");
    setPwError("");
    setPwDone(false);
  }

  function generatePassword() {
    // סיסמה קריאה שנוח למסור בעל-פה: 8 אותיות/ספרות בלי תווים דו-משמעיים
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    const rand = new Uint32Array(10);
    crypto.getRandomValues(rand);
    for (let i = 0; i < 10; i++) out += chars[rand[i] % chars.length];
    setPwValue(out);
  }

  async function handleSetPassword() {
    if (!pwUser) return;
    if (pwValue.length < 8) {
      setPwError("סיסמה חייבת להיות באורך 8 תווים לפחות");
      return;
    }
    setPwError("");
    setPwSaving(true);
    try {
      const res = await fetch("/api/users/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pwUser.email, password: pwValue }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; created?: boolean };
      if (!res.ok) {
        setPwError(data.error ?? "שגיאה בקביעת הסיסמה");
      } else {
        setPwDone(true);
        toast.success(
          data.created
            ? "נוצר חשבון התחברות חדש עם הסיסמה שנקבעה"
            : "הסיסמה עודכנה בהצלחה"
        );
      }
    } catch {
      setPwError("שגיאת רשת — נסה שוב");
    } finally {
      setPwSaving(false);
    }
  }

  function openAddDialog() {
    setEditingUser(null);
    setFormName("");
    setFormEmail("");
    setFormRole("מגייס");
    setFormError("");
    setDialogOpen(true);
  }

  function openEditDialog(user: UserProfile) {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormRole(user.role);
    setFormError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formName.trim() || !formEmail.trim()) {
      setFormError("שם ואימייל הם שדות חובה");
      return;
    }
    setFormError("");
    setSaving(true);

    const payload = {
      name: formName.trim(),
      email: formEmail.trim(),
      role: formRole,
    };

    const result = editingUser
      ? await updateUser(editingUser.id, payload)
      : await createUser(payload);

    setSaving(false);
    if (result.error) {
      setFormError(result.error);
    } else {
      toast.success(editingUser ? "משתמש עודכן בהצלחה!" : "משתמש נוסף בהצלחה!");
      setDialogOpen(false);
      router.refresh();
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    const result = await deleteUser(id);
    setDeleting(false);
    if (result.error) {
      toast.error(`שגיאה במחיקה: ${result.error}`);
    } else {
      toast.success("משתמש נמחק בהצלחה");
      setDeleteConfirmId(null);
      router.refresh();
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">ניהול משתמשים</h1>
          <p className="text-sm text-gray-500 mt-1">הוספה ועריכה של מגייסים ואדמינים</p>
        </div>
        <Button onClick={openAddDialog} className="gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M5 12h14" /><path d="M12 5v14" />
          </svg>
          הוסף משתמש
        </Button>
      </div>

      {/* Table */}
      {initialUsers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-gray-400">
              <path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" />
              <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">אין משתמשים עדיין</p>
          <Button onClick={openAddDialog} variant="outline" className="mt-4 gap-1.5">
            הוסף משתמש ראשון
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50/50">
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">שם</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">אימייל</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">תפקיד</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">תאריך הוספה</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {initialUsers.map((user) => (
                <tr key={user.id} className="border-b last:border-b-0 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900">{user.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600" dir="ltr">{user.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={user.role === "אדמין"
                      ? "bg-purple-100 text-purple-800 hover:bg-purple-100"
                      : "bg-blue-100 text-blue-800 hover:bg-blue-100"
                    }>
                      {user.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString("he-IL")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditDialog(user)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
                        title="ערוך"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => openPasswordDialog(user)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        title="אפס סיסמה"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
                          <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(user.id)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="מחק"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingUser ? "עריכת משתמש" : "הוספת משתמש חדש"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="user-name">שם *</Label>
              <Input
                id="user-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="שם המשתמש"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">אימייל *</Label>
              <Input
                id="user-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="email@example.com"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-role">תפקיד</Label>
              <select
                id="user-role"
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            {formError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 font-medium">
                {formError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              ביטול
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim() || !formEmail.trim()}>
              {saving ? "שומר..." : editingUser ? "שמור שינויים" : "הוסף משתמש"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={!!pwUser} onOpenChange={(open) => { if (!open) setPwUser(null); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>איפוס סיסמה — {pwUser?.name}</DialogTitle>
          </DialogHeader>
          {pwDone ? (
            <div className="py-2 space-y-3">
              <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-3 text-sm text-green-800">
                הסיסמה נקבעה בהצלחה. מסור אותה למשתמש/ת — היא לא תוצג שוב:
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-3 text-center">
                <span className="font-mono text-lg font-bold tracking-wider" dir="ltr">{pwValue}</span>
              </div>
              <p className="text-xs text-gray-500">
                כניסה למערכת עם האימייל <span dir="ltr">{pwUser?.email}</span> והסיסמה הזו.
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <p className="text-sm text-gray-600">
                קביעת סיסמה חדשה עבור <span dir="ltr" className="font-medium">{pwUser?.email}</span>.
                אם אין למשתמש/ת עדיין חשבון התחברות — הוא ייווצר עכשיו.
              </p>
              <div className="space-y-2">
                <Label htmlFor="pw-value">סיסמה חדשה (8 תווים לפחות)</Label>
                <div className="flex gap-2">
                  <Input
                    id="pw-value"
                    value={pwValue}
                    onChange={(e) => setPwValue(e.target.value)}
                    placeholder="הקלד או צור אקראית"
                    dir="ltr"
                    className="font-mono"
                  />
                  <Button type="button" variant="outline" onClick={generatePassword} className="flex-shrink-0">
                    צור אקראית
                  </Button>
                </div>
              </div>
              {pwError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 font-medium">
                  {pwError}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {pwDone ? (
              <Button onClick={() => setPwUser(null)}>סגור</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setPwUser(null)} disabled={pwSaving}>
                  ביטול
                </Button>
                <Button onClick={handleSetPassword} disabled={pwSaving || pwValue.length < 8}>
                  {pwSaving ? "קובע..." : "קבע סיסמה"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>מחיקת משתמש</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            האם אתה בטוח שברצונך למחוק משתמש זה? פעולה זו אינה ניתנת לביטול.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>
              ביטול
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={deleting}
            >
              {deleting ? "מוחק..." : "מחק"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
