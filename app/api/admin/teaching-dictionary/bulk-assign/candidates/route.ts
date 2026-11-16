import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/access";
import type { BulkFilters } from "@/lib/teaching-dictionary-manager/bulk-skill-assignment";
import { loadBulkWordFilterOptions, readBulkCandidatePage } from "@/app/(authenticated)/admin/teaching-dictionary/bulk-assign/candidate-page";

const headers = { "Cache-Control": "private, no-store" };

async function authorize() {
  const result = await getAdminUser();
  if (result.status === "authorized") return null;
  return NextResponse.json({ error: "Admin access required." }, {
    status: result.status === "unauthenticated" ? 401 : 404, headers,
  });
}

export async function GET() {
  const denied = await authorize();
  if (denied) return denied;
  return NextResponse.json(await loadBulkWordFilterOptions(), { headers });
}

export async function POST(request: Request) {
  const denied = await authorize();
  if (denied) return denied;
  const input = await request.json().catch(() => null) as {
    skill?: string; filters?: BulkFilters; page?: number; selectedSenses?: Record<string, string>;
  } | null;
  const { skill, filters, page, selectedSenses } = input ?? {};
  if (typeof skill !== "string" || !/^[a-z0-9_]{1,128}$/iu.test(skill)
    || typeof page !== "number" || !Number.isSafeInteger(page) || page < 1
    || !filters || ![filters.search, filters.morpheme, filters.syllables, filters.phoneme]
      .every(value => typeof value === "string" && value.length <= 256)
    || !["all", "yes", "no", "unknown"].includes(filters.schwa)
    || !selectedSenses || typeof selectedSenses !== "object" || Array.isArray(selectedSenses)) {
    return NextResponse.json({ error: "Choose a valid page of dictionary words." }, { status: 400, headers });
  }
  return NextResponse.json(await readBulkCandidatePage(skill, filters, page, selectedSenses), { headers });
}
