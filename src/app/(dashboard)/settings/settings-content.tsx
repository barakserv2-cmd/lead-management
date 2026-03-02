"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getGmailStatus, disconnectGmail } from "./actions";

function SettingsInner() {
  const searchParams = useSearchParams();
  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    email: string | null;
    connectedAt: string | null;
  }>({ connected: false, email: null, connectedAt: null });
  const [disconnecting, setDisconnecting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<{
    new_leads: number;
    processed: number;
    duplicates: number;
    skipped: number;
    errors: number;
  } | null>(null);

  useEffect(() => {
    getGmailStatus()
      .then(setGmailStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (searchParams.get("gmail_connected") === "true") {
      toast.success("Gmail חובר בהצלחה!");
      getGmailStatus().then(setGmailStatus).catch(() => {});
    }
    const error = searchParams.get("gmail_error");
    if (error) {
      toast.error(`שגיאה בחיבור Gmail: ${error}`);
    }
  }, [searchParams]);

  async function handleDisconnect() {
    setDisconnecting(true);
    const { error } = await disconnectGmail();
    if (error) {
      toast.error(`שגיאה בניתוק: ${error}`);
    } else {
      toast.success("Gmail נותק בהצלחה");
      setGmailStatus({ connected: false, email: null, connectedAt: null });
    }
    setDisconnecting(false);
  }

  async function handleFetchEmails() {
    setFetching(true);
    setFetchResult(null);
    try {
      const res = await fetch("/api/gmail", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(`שגיאה בשליפת מיילים: ${data.error || "Unknown error"}`);
      } else {
        setFetchResult(data);
        if (data.new_leads > 0) {
          toast.success(`נוספו ${data.new_leads} לידים חדשים!`);
        } else {
          toast.info("לא נמצאו לידים חדשים");
        }
      }
    } catch (err) {
      toast.error(`שגיאה: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setFetching(false);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">הגדרות</h1>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>חיבור Gmail</CardTitle>
            <CardDescription>
              חיבור חשבון Gmail לקליטה אוטומטית של לידים ממיילים.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {gmailStatus.connected && (
              <div className="flex items-center gap-3 mb-3">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
                <div>
                  <p className="text-sm font-medium">
                    מחובר — {gmailStatus.email}
                  </p>
                  {gmailStatus.connectedAt && (
                    <p className="text-xs text-gray-500">
                      חובר בתאריך{" "}
                      {new Date(gmailStatus.connectedAt).toLocaleDateString("he-IL")}
                    </p>
                  )}
                </div>
              </div>
            )}

            {!gmailStatus.connected && (
              <div className="flex items-center gap-3 mb-3">
                <span className="inline-block w-3 h-3 rounded-full bg-gray-300" />
                <p className="text-sm text-gray-500">Gmail לא מחובר</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => (window.location.href = "/api/auth/gmail/authorize")}
              >
                חבר Gmail
              </Button>
              <Button
                variant="outline"
                onClick={handleFetchEmails}
                disabled={fetching}
              >
                {fetching ? "שולף מיילים..." : "שלוף מיילים"}
              </Button>
              {gmailStatus.connected && (
                <Button
                  variant="destructive"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? "מנתק..." : "נתק"}
                </Button>
              )}
            </div>

            {fetchResult && (
              <div className="mt-3 text-xs text-gray-500 border-t pt-3">
                <p>עובדו: {fetchResult.processed} | חדשים: {fetchResult.new_leads} | כפולים: {fetchResult.duplicates} | דולגו: {fetchResult.skipped} | שגיאות: {fetchResult.errors}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Link href="/settings/users">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>ניהול משתמשים</CardTitle>
                  <CardDescription>
                    הוספה ועריכה של מגייסים ואדמינים.
                  </CardDescription>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-gray-400">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>תבניות הודעות</CardTitle>
            <CardDescription>
              עריכת תבניות וואטסאפ ואימייל.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

export default function SettingsContent() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400">טוען...</div>}>
      <SettingsInner />
    </Suspense>
  );
}
