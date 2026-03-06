// ============================================================
// Employer Name Normalization — fuzzy matching against existing
// employer names to prevent duplicates from typos.
// ============================================================

import stringSimilarity from "string-similarity";
import { createClient as createServerClient } from "@supabase/supabase-js";

const SIMILARITY_THRESHOLD = 0.75;

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Fetch all unique, non-null employer names from the leads table.
 */
async function fetchExistingEmployers(): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("leads")
    .select("hired_client")
    .not("hired_client", "is", null);

  if (error || !data) return [];

  const unique = new Set<string>();
  for (const row of data) {
    const name = (row.hired_client as string)?.trim();
    if (name) unique.add(name);
  }
  return Array.from(unique);
}

export interface NormalizationResult {
  /** The name to use (either the matched existing name or the original input) */
  normalized: string;
  /** The original input before normalization */
  original: string;
  /** Whether a match was found and applied */
  wasNormalized: boolean;
  /** The similarity score of the best match (0-1), null if no existing employers */
  score: number | null;
  /** The best matching employer name, null if no existing employers */
  bestMatch: string | null;
}

/**
 * Normalize an employer name by comparing it against all existing employer
 * names in the database using fuzzy string matching.
 *
 * If the best match scores >= 0.75, the existing name is returned.
 * Otherwise, the original input is treated as a new employer.
 */
export async function normalizeEmployerName(
  input: string
): Promise<NormalizationResult> {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      normalized: trimmed,
      original: trimmed,
      wasNormalized: false,
      score: null,
      bestMatch: null,
    };
  }

  const existing = await fetchExistingEmployers();

  // No existing employers to compare against — treat as new
  if (existing.length === 0) {
    return {
      normalized: trimmed,
      original: trimmed,
      wasNormalized: false,
      score: null,
      bestMatch: null,
    };
  }

  // Exact match — no fuzzy search needed
  const exactMatch = existing.find(
    (e) => e.toLowerCase() === trimmed.toLowerCase()
  );
  if (exactMatch) {
    return {
      normalized: exactMatch,
      original: trimmed,
      wasNormalized: exactMatch !== trimmed,
      score: 1,
      bestMatch: exactMatch,
    };
  }

  // Fuzzy match
  const result = stringSimilarity.findBestMatch(trimmed, existing);
  const best = result.bestMatch;

  if (best.rating >= SIMILARITY_THRESHOLD) {
    return {
      normalized: best.target,
      original: trimmed,
      wasNormalized: true,
      score: best.rating,
      bestMatch: best.target,
    };
  }

  return {
    normalized: trimmed,
    original: trimmed,
    wasNormalized: false,
    score: best.rating,
    bestMatch: best.target,
  };
}
