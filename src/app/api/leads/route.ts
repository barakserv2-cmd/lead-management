import { NextResponse } from "next/server";

export async function GET() {
  // TODO: Fetch leads from Supabase with filters
  return NextResponse.json({ leads: [], total: 0 });
}

export async function POST() {
  // TODO: Create a new lead
  return NextResponse.json({ message: "Lead creation placeholder" });
}
