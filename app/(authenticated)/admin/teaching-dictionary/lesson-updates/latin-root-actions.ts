"use server";
import {revalidatePath,updateTag} from "next/cache";
import {redirect} from "next/navigation";
import {requireAdminUser} from "@/lib/admin/access";
import {createServiceRoleClient} from "@/lib/supabase/service-role";
import {publishLatinRootBulkReview} from "@/lib/teaching-dictionary-manager/latin-root-bulk-review";
import {LATIN_ROOT_REVIEW_SKILL} from "@/lib/teaching-dictionary-manager/latin-root-review";
import {TEACHING_DICTIONARY_EVIDENCE_TAG} from "@/lib/teaching-dictionary-manager/evidence-authority";
export async function publishLatinRootWorkbook(form:FormData){const actor=await requireAdminUser();const href=`/admin/teaching-dictionary/lesson-updates?skill=${LATIN_ROOT_REVIEW_SKILL}&view=preview`;let error="";let count=0;
 try{const hash=String(form.get("preview_hash")??"");if(!/^[a-f0-9]{64}$/.test(hash))throw Error("Open a fresh Latin roots preview.");const result=await publishLatinRootBulkReview(createServiceRoleClient(),actor.id,hash,String(form.get("head_id")??"")||null);count=result.wordCount;}catch(cause){error=cause instanceof Error?cause.message:"Could not publish the Latin roots update.";}
 updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);revalidatePath("/admin/teaching-dictionary/lesson-updates");revalidatePath("/admin/teaching-dictionary");redirect(error?`${href}&error=${encodeURIComponent(error)}`:`${href}&published=${count}`);
}
