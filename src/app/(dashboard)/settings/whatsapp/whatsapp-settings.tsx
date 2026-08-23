"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AccountStatus {
  connected: boolean;
  instanceId?: string;
  phone?: string | null;
  label?: string | null;
  state?: string;
  qr?: string | null;
  createdAt?: string;
}

const STATE_LABELS: Record<string, { text: string; color: string }> = {
  authorized: { text: "מחובר — הטלפון מקושר", color: "bg-green-500" },
  notAuthorized: { text: "ממתין לסריקת QR", color: "bg-amber-500" },
  starting: { text: "מתחיל...", color: "bg-amber-500" },
  sleepMode: { text: "במצב שינה — פתח וואטסאפ בטלפון", color: "bg-amber-500" },
  blocked: { text: "חסום ב-Green API", color: "bg-red-500" },
  yellowCard: { text: "אזהרה מוואטסאפ (yellow card)", color: "bg-red-500" },
  error: { text: "שגיאה בבדיקת המצב", color: "bg-red-500" },
  unknown: { text: "מצב לא ידוע", color: "bg-gray-400" },
};

async function loadStatus(withQr: boolean): Promise<AccountStatus | null> {
  try {
    const res = await fetch(`/api/whatsapp/account${withQr ? "?qr=1" : ""}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as AccountStatus;
  } catch {
    return null;
  }
}

function formatPhone(p: string | null | undefined): string {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  return d.startsWith("972") ? "0" + d.slice(3) : d;
}

export function WhatsAppSettings() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [instanceId, setInstanceId] = useState("");
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const refresh = useCallback((withQr: boolean) => {
    return loadStatus(withQr).then((s) => {
      if (s) setStatus(s);
    });
  }, []);

  useEffect(() => {
    loadStatus(true).then((s) => s && setStatus(s));
  }, []);

  // While waiting for the phone to scan, poll for a fresh QR (Green API
  // rotates it every ~20s) and for the state flipping to authorized.
  const waitingForScan = status?.connected && status.state === "notAuthorized";
  useEffect(() => {
    if (!waitingForScan) return;
    const t = setInterval(() => refresh(true), 15000);
    return () => clearInterval(t);
  }, [waitingForScan, refresh]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId, token, label }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "החיבור נכשל");
      } else {
        toast.success(
          data.state === "authorized"
            ? "הוואטסאפ שלך מחובר!"
            : "ה-instance נשמר — עכשיו סרוק את ה-QR מהטלפון"
        );
        setToken("");
        await refresh(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה");
    }
    setSaving(false);
  }

  async function handleDisconnect(logout: boolean) {
    if (
      !confirm(
        logout
          ? "לנתק את הטלפון מה-instance ולהסיר את החיבור מהמערכת?"
          : "להסיר את החיבור מהמערכת? (הטלפון יישאר מקושר ב-Green API)"
      )
    )
      return;
    setRemoving(true);
    try {
      await fetch(`/api/whatsapp/account${logout ? "?logout=1" : ""}`, {
        method: "DELETE",
      });
      toast.success("החיבור הוסר");
      setStatus({ connected: false });
    } catch {
      toast.error("הסרה נכשלה");
    }
    setRemoving(false);
  }

  const stateInfo = STATE_LABELS[status?.state ?? "unknown"] ?? STATE_LABELS.unknown;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings" className="text-sm text-gray-500 hover:underline">
          הגדרות
        </Link>
        <span className="text-gray-400">/</span>
        <h1 className="text-2xl font-bold">הוואטסאפ שלי</h1>
      </div>

      <div className="space-y-4 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>המספר האישי שלך</CardTitle>
            <CardDescription>
              כשהמספר שלך מחובר, כל הודעה שתשלח למועמד מהמערכת (צ&apos;אט או
              שליחה מרוכזת) תצא מהוואטסאפ שלך, ותשובות המועמדים — וגם הודעות
              שתשלח להם ישירות מהטלפון — ייכנסו לצ&apos;אט של הליד. בלי חיבור,
              ההודעות יוצאות ממספר העסק.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status === null && <p className="text-sm text-gray-500">טוען...</p>}

            {status?.connected === false && (
              <div className="flex items-center gap-3">
                <span className="inline-block w-3 h-3 rounded-full bg-gray-300" />
                <p className="text-sm text-gray-500">
                  לא מחובר — ההודעות שלך יוצאות ממספר העסק
                </p>
              </div>
            )}

            {status?.connected && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className={`inline-block w-3 h-3 rounded-full ${stateInfo.color}`} />
                  <div>
                    <p className="text-sm font-medium">
                      {stateInfo.text}
                      {status.phone && status.state === "authorized" && (
                        <span className="font-mono ms-2" dir="ltr">
                          {formatPhone(status.phone)}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500" dir="ltr">
                      instance {status.instanceId}
                      {status.label ? ` · ${status.label}` : ""}
                    </p>
                  </div>
                </div>

                {status.state === "notAuthorized" && (
                  <div className="rounded-lg border bg-white p-4 flex flex-col items-center gap-3">
                    {status.qr ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={status.qr} alt="QR לחיבור וואטסאפ" className="w-64 h-64" />
                    ) : (
                      <p className="text-sm text-gray-500">מייצר QR...</p>
                    )}
                    <ol className="text-sm text-gray-600 list-decimal pr-5 space-y-1 self-start">
                      <li>פתח וואטסאפ בטלפון ← תפריט ← <b>מכשירים מקושרים</b></li>
                      <li>לחץ <b>קישור מכשיר</b> וסרוק את הקוד</li>
                      <li>הדף מתעדכן לבד אחרי הסריקה</li>
                    </ol>
                    <Button variant="outline" size="sm" onClick={() => refresh(true)}>
                      רענן QR
                    </Button>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => refresh(true)}>
                    בדוק מצב
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={removing}
                    onClick={() => handleDisconnect(false)}
                  >
                    הסר חיבור
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={removing}
                    onClick={() => handleDisconnect(true)}
                  >
                    נתק טלפון והסר
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{status?.connected ? "החלפת instance" : "חיבור המספר שלך"}</CardTitle>
            <CardDescription>
              כל משתמש צריך instance משלו ב-Green API (לא של מספר העסק). פתח{" "}
              <a
                href="https://console.green-api.com/"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                console.green-api.com
              </a>
              , צור instance, והעתק לכאן את ה-Instance ID וה-API Token. אחרי
              השמירה יופיע QR לסריקה מהטלפון שלך.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleConnect} className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="wa-instance">Instance ID</Label>
                <Input
                  id="wa-instance"
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="7103xxxxxx"
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wa-token">API Token</Label>
                <Input
                  id="wa-token"
                  dir="ltr"
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wa-label">שם להצגה (אופציונלי)</Label>
                <Input
                  id="wa-label"
                  placeholder="למשל: נועה — גיוס"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "בודק מול Green API..." : "שמור וחבר"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
