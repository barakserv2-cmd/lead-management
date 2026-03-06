"use client";

import { useState, useMemo } from "react";
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
import type { Client, ClientStatus } from "@/types/clients";
import { createClient, updateClient } from "./actions";

// ── Constants ────────────────────────────────────────────────

const STATUS_CONFIG: Record<ClientStatus, { label: string; color: string }> = {
  Active: { label: "פעיל", color: "bg-emerald-500 text-white" },
  Frozen: { label: "מוקפא", color: "bg-blue-100 text-blue-800" },
  Debt: { label: "חוב", color: "bg-red-500 text-white" },
};

const TYPE_LABELS: Record<string, string> = {
  Hotels: "מלונאות",
  Fashion: "אופנה וביגוד",
  Retail: "קמעונאות וסופרים",
  Pharma: "פארם וקוסמטיקה",
  Other: "אחר",
};

const FILTER_TABS: { key: string; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "Active", label: "פעילים" },
  { key: "Debt", label: "חוב" },
];

// ── Helpers ──────────────────────────────────────────────────

function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/[\s\-()]/g, "").replace(/^0/, "972");
}

// ── Icons ────────────────────────────────────────────────────

function PhoneIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function PlusIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}

function PencilIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────

export function ClientsContent({ clients: initialClients }: { clients: Client[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formType, setFormType] = useState("Other");
  const [formCity, setFormCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Filter + search
  const filtered = useMemo(() => {
    let result = initialClients;

    if (activeFilter !== "all") {
      result = result.filter((c) => c.status === activeFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.contact_person?.toLowerCase().includes(q) ?? false)
      );
    }

    return result;
  }, [initialClients, activeFilter, search]);

  function openAddDialog() {
    setEditingClient(null);
    setFormName("");
    setFormContact("");
    setFormPhone("");
    setFormEmail("");
    setFormType("Other");
    setFormCity("");
    setFormError("");
    setDialogOpen(true);
  }

  function openEditDialog(client: Client) {
    setEditingClient(client);
    setFormName(client.name);
    setFormContact(client.contact_person ?? "");
    setFormPhone(client.phone);
    setFormEmail(client.email ?? "");
    setFormType(client.type);
    setFormCity(client.city ?? "");
    setFormError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formName.trim() || !formPhone.trim()) {
      setFormError("שם וטלפון הם שדות חובה");
      return;
    }
    setFormError("");
    setSaving(true);

    const payload = {
      name: formName.trim(),
      contact_person: formContact.trim(),
      phone: formPhone.trim(),
      email: formEmail.trim(),
      type: formType,
      city: formCity.trim(),
    };

    const result = editingClient
      ? await updateClient(editingClient.id, payload)
      : await createClient(payload);

    setSaving(false);
    if (result.error) {
      setFormError(result.error);
    } else {
      toast.success(editingClient ? "מעסיק עודכן בהצלחה!" : "מעסיק נוסף בהצלחה!");
      setDialogOpen(false);
      router.refresh();
    }
  }

  return (
    <div>
      {/* ═══ HEADER ═══════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">מעסיקים</h1>
        <div className="flex items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש שם / טלפון..."
            className="w-64 text-sm"
          />
          <Button onClick={openAddDialog} className="gap-1.5">
            <PlusIcon className="w-4 h-4" />
            מעסיק חדש
          </Button>
        </div>
      </div>

      {/* ═══ FILTER TABS ══════════════════════════════════════ */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveFilter(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeFilter === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.key !== "all" && (
              <span className="mr-1.5 text-xs text-gray-400">
                ({initialClients.filter((c) => c.status === tab.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ CARD GRID ════════════════════════════════════════ */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🏢</span>
          </div>
          <p className="text-gray-500 font-medium">
            {search ? "לא נמצאו תוצאות" : "אין מעסיקים עדיין"}
          </p>
          {!search && (
            <Button onClick={openAddDialog} variant="outline" className="mt-4 gap-1.5">
              <PlusIcon className="w-4 h-4" />
              הוסף מעסיק ראשון
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((client) => (
            <ClientCard key={client.id} client={client} onEdit={openEditDialog} />
          ))}
        </div>
      )}

      {/* ═══ ADD / EDIT CLIENT DIALOG ═════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingClient ? "עריכת מעסיק" : "הוספת מעסיק חדש"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="client-name">שם החברה / המעסיק *</Label>
              <Input
                id="client-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="שם המעסיק"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-contact">איש קשר</Label>
              <Input
                id="client-contact"
                value={formContact}
                onChange={(e) => setFormContact(e.target.value)}
                placeholder="שם איש הקשר"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="client-phone">טלפון *</Label>
                <Input
                  id="client-phone"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="050-1234567"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-city">עיר</Label>
                <Input
                  id="client-city"
                  value={formCity}
                  onChange={(e) => setFormCity(e.target.value)}
                  placeholder="עיר"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-type">סוג מעסיק</Label>
              <select
                id="client-type"
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="Hotels">מלונאות</option>
                <option value="Fashion">אופנה וביגוד</option>
                <option value="Retail">קמעונאות וסופרים</option>
                <option value="Pharma">פארם וקוסמטיקה</option>
                <option value="Other">אחר</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-email">אימייל</Label>
              <Input
                id="client-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="email@example.com"
                dir="ltr"
              />
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
            <Button onClick={handleSave} disabled={saving || !formName.trim() || !formPhone.trim()}>
              {saving ? "שומר..." : editingClient ? "שמור שינויים" : "הוסף מעסיק"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Client Card ──────────────────────────────────────────────

function ClientCard({ client, onEdit }: { client: Client; onEdit: (client: Client) => void }) {
  const intlPhone = formatPhone(client.phone);
  const statusCfg = STATUS_CONFIG[client.status] ?? STATUS_CONFIG.Active;
  const typeLabel = TYPE_LABELS[client.type] ?? client.type;

  return (
    <div className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900 truncate">{client.name}</h3>
            {client.contact_person && (
              <p className="text-xs text-gray-500 mt-0.5">{client.contact_person}</p>
            )}
          </div>
          <Badge className={`text-[11px] flex-shrink-0 ${statusCfg.color}`}>
            {statusCfg.label}
          </Badge>
        </div>

        {/* Sub-header: City + Type */}
        <div className="flex items-center gap-2 mt-2">
          {client.city && (
            <span className="text-xs text-gray-400">{client.city}</span>
          )}
          {client.city && <span className="text-gray-200">|</span>}
          <span className="text-xs text-gray-400">{typeLabel}</span>
        </div>
      </div>

      {/* Metrics Row */}
      {/* Actions Row */}
      <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setTimeout(() => {
              const a = document.createElement("a");
              a.href = "tel:" + client.phone;
              a.click();
            }, 100);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan-50 text-cyan-700 text-xs font-medium hover:bg-cyan-100 transition-colors"
        >
          <PhoneIcon className="w-3.5 h-3.5" />
          התקשר
        </button>
        {intlPhone && (
          <button
            type="button"
            onClick={() => {
              setTimeout(() => {
                window.open("https://api.whatsapp.com/send?phone=" + intlPhone, "_blank", "noopener,noreferrer");
              }, 100);
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors"
          >
            <WhatsAppIcon className="w-3.5 h-3.5" />
            WhatsApp
          </button>
        )}
        <button
          type="button"
          onClick={() => onEdit(client)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-50 text-gray-700 text-xs font-medium hover:bg-gray-100 transition-colors"
        >
          <PencilIcon className="w-3.5 h-3.5" />
          עריכה
        </button>
      </div>
    </div>
  );
}
