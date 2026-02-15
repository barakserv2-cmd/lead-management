import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Validate API key from Authorization header
export function validateApiKey(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const token = authHeader.replace("Bearer ", "");
  return token === process.env.API_SECRET_KEY;
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Unauthorized. Provide a valid Bearer token in the Authorization header." },
    { status: 401 }
  );
}

// Admin Supabase client for API routes (bypasses RLS)
export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
  }

  const key = serviceRoleKey || anonKey;
  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable");
  }

  if (!serviceRoleKey) {
    console.warn("[api-auth] SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon key. RLS-protected tables may be inaccessible.");
  }

  return createClient(supabaseUrl, key);
}
