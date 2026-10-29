import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { britishRecordingForText, type BritishRecordingKind } from "@/lib/teaching-dictionary-manager/british-recordings";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { text?: unknown; kind?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const kind = body.kind;
  if (!text || text.length > 500 || (kind !== "word" && kind !== "sentence"))
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const db = createServiceRoleClient();
    const clip = await britishRecordingForText({ client: db, text, kind: kind as BritishRecordingKind }) ??
      (kind === "sentence" ? await britishRecordingForText({ client: db, text, kind: "word" }) : null);
    return NextResponse.json({ src: clip?.src ?? null, source: clip?.source ?? "device_voice" },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ src: null, source: "device_voice" },
      { headers: { "Cache-Control": "private, no-store" } });
  }
}
