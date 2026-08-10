"use server";

import { redirect } from "next/navigation";

import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { replaceAnalysisForSample } from "@/lib/writing-engine/spelling/legacy-analysis";
import { saveManualWritingSampleIntake } from "@/lib/writing-samples/manual-intake";

export async function saveManualWritingSample(formData: FormData) {
  const location = await saveManualWritingSampleIntake(formData, {
    createClient,
    async getSignedInParentUserId(client) {
      const {
        data: { user },
      } = await client.auth.getUser();

      return user?.id ?? null;
    },
    getActiveChildrenForUser,
    async insertWritingSample(client, record) {
      return client
        .from("writing_samples")
        .insert(record)
        .select("id, child_id, sample_text")
        .single();
    },
    async replaceAnalysisForSample(_client, sample, parentUserId) {
      return replaceAnalysisForSample(
        createServiceRoleClient(),
        sample,
        parentUserId,
      );
    },
  });

  redirect(location);
}
