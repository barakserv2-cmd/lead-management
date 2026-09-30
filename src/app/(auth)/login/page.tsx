"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // התחברות מוצלחת אינה הרשאה: רק מי שמופיע/ה במסך המשתמשים נכנס/ת.
    // בלי זה ה-proxy היה מחזיר לכאן בשקט, בלולאה.
    const { data: isRecruiter } = await supabase.rpc("is_recruiter");
    if (isRecruiter === false) {
      await supabase.auth.signOut();
      setError("החשבון הזה לא מורשה להיכנס למערכת. אם זו טעות, פנו לאדמין.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 shadow-sm p-8 overflow-hidden">
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 w-10 h-10 rounded-lg bg-gray-900 text-white flex items-center justify-center text-base font-bold">ב</div>
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight">ברק שירותים</h1>
        <p className="text-[13px] text-gray-500 mt-1">התחברות למערכת גיוס</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            אימייל
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-10 px-3 border border-gray-300 rounded-md shadow-xs text-sm focus:outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
            placeholder="your@email.com"
            dir="ltr"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            סיסמה
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-10 px-3 border border-gray-300 rounded-md shadow-xs text-sm focus:outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
            dir="ltr"
            required
          />
        </div>
        {error && (
          <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 bg-cyan-600 text-white rounded-md text-sm font-medium shadow-xs hover:bg-cyan-700 transition-colors disabled:opacity-50"
        >
          {loading ? "מתחבר..." : "התחברות"}
        </button>
      </form>
    </div>
  );
}
