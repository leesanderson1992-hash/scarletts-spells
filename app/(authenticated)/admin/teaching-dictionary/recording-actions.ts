"use server";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";

const audioPath = /^\/audio\/[a-z0-9/_-]+\.(?:mp3|m4a|wav)$/i;
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Explicit editorial approval of one exact British recording and spoken text. */
export async function approveDictionaryBritishRecording(form: FormData) {
  const actor = await requireAdminUser();
  const wordId = value(form, "word_id");
  const path = isUuid(wordId) ? `/admin/teaching-dictionary/${wordId}` : "/admin/teaching-dictionary";
  try {
    const kind = value(form, "kind");
    const src = value(form, "recording_src");
    const sourceReference = value(form, "source_reference");
    if (!isUuid(wordId) || (kind !== "word" && kind !== "sentence") || !audioPath.test(src) ||
      !sourceReference || sourceReference.length > 1000) throw new Error("BRITISH_RECORDING_REVIEW_INVALID");
    const db = createServiceRoleClient();
    const word = await db.from("canonical_teaching_dictionary_words")
      .select("display_word,row_status,review_status,dialect_code").eq("id", wordId).single();
    if (word.error || !word.data || word.data.row_status !== "active" ||
      word.data.review_status !== "approved_for_first_exposure" || word.data.dialect_code !== "en-GB")
      throw new Error("BRITISH_RECORDING_WORD_NOT_APPROVED");
    let spokenText = word.data.display_word;
    if (kind === "sentence") {
      const sentence = await db.from("canonical_teaching_dictionary_dictation_sentences")
        .select("dictation_sentence").eq("canonical_word_id", wordId).eq("row_status", "active")
        .eq("review_status", "approved_for_first_exposure")
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
      if (sentence.error || !sentence.data?.dictation_sentence?.trim())
        throw new Error("BRITISH_RECORDING_SENTENCE_NOT_APPROVED");
      spokenText = sentence.data.dictation_sentence;
    }
    let bytes: Uint8Array;
    if (process.env.VERCEL_URL) {
      const response = await fetch(`https://${process.env.VERCEL_URL}${src}`, { cache: "no-store" });
      if (!response.ok) throw new Error("BRITISH_RECORDING_ASSET_MISSING");
      bytes = new Uint8Array(await response.arrayBuffer());
    } else {
      try { bytes = readFileSync(resolve(process.cwd(), "public", `.${src}`)); }
      catch { throw new Error("BRITISH_RECORDING_ASSET_MISSING"); }
    }
    if (!bytes.length || bytes.length > 20_000_000) throw new Error("BRITISH_RECORDING_ASSET_INVALID");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const saved = await db.from("teaching_dictionary_british_recording_versions").insert({
      canonical_word_id: wordId, kind, spoken_text: spokenText,
      recording_src: src, sha256, source_reference: sourceReference, reviewed_by: actor.id,
    });
    if (saved.error) throw new Error("BRITISH_RECORDING_SAVE_FAILED");
    revalidatePath(path);
    revalidatePath("/admin/teaching-dictionary");
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message : "BRITISH_RECORDING_REVIEW_FAILED";
    redirect(`${path}?error=${code}`);
  }
  redirect(`${path}?saved=british_recording`);
}
