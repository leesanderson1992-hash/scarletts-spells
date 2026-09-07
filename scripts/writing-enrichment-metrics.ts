import { createClient } from "@supabase/supabase-js";

const value = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; };
async function main() {
  const environment = value("--environment");
  if (!environment || !["local", "staging", "production"].includes(environment)) throw new Error("Use --environment local|staging|production");
  if (environment === "production" && !process.argv.includes("--acknowledge-read-only-production")) throw new Error("Production metrics require --acknowledge-read-only-production");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SB_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Supabase URL and service role key are required");
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const latest = await client.from("writing_enrichment_inventory_runs").select("id,run_key,scanned_at,input_fingerprint")
    .eq("environment_key", environment).order("scanned_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw new Error("WRITING_ENRICHMENT_METRICS_READ_FAILED");
  const [entries, generation, replay, resolution, rejections] = await Promise.all([
    latest.data ? client.from("writing_enrichment_inventory_entries").select("gap_type,occurrence_count").eq("run_id", latest.data.id) : Promise.resolve({ data: [], error: null }),
    client.from("writing_enrichment_metrics").select("*").eq("environment_key", environment),
    client.from("writing_enrichment_replay_status").select("*").eq("environment_key", environment).order("event_sequence"),
    client.from("writing_enrichment_event_resolution_metrics").select("*").eq("environment_key", environment),
    client.from("writing_enrichment_rejection_metrics").select("rejection_reason,rejection_count").eq("environment_key", environment),
  ]);
  if ([entries, generation, replay, resolution, rejections].some((result) => result.error)) throw new Error("WRITING_ENRICHMENT_METRICS_READ_FAILED");
  const backlog = Object.fromEntries([...new Set((entries.data ?? []).map((row) => row.gap_type))].map((gapType) => [gapType, {
    entries: (entries.data ?? []).filter((row) => row.gap_type === gapType).length,
    affectedOccurrenceMemberships: (entries.data ?? []).filter((row) => row.gap_type === gapType).reduce((sum, row) => sum + row.occurrence_count, 0),
  }]));
  console.log(JSON.stringify({ schemaVersion: "writing_enrichment_metrics_v1", environment, latestInventory: latest.data ?? null,
    remainingBacklog: backlog, generation: generation.data ?? [], replay: replay.data ?? [], resolution: resolution.data ?? [],
    rejectionReasons: rejections.data ?? [], ai: { calls: 0, tokens: 0, cost: 0 } }, null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
