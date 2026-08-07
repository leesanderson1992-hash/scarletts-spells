"use server";

import { revalidatePath } from "next/cache";

import { ensureParentAdleTodayAssignment } from "@/lib/adle/today-assignment-service";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type TodayAdleActionState =
  | { state: "empty" }
  | { state: "ready"; assignmentId: string; href: string }
  | { state: "completed"; assignmentId: string; href: string }
  | { state: "no_eligible" }
  | { state: "rejected" }
  | { state: "failed" };

export async function generateTodayAdleAction(
  _previousState: TodayAdleActionState,
  formData: FormData,
): Promise<TodayAdleActionState> {
  const childId = typeof formData.get("childId") === "string"
    ? String(formData.get("childId")).trim()
    : "";
  if (!childId) return { state: "rejected" };

  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { state: "rejected" };

  // The form value is untrusted. Prove the exact active relationship before
  // creating a service-role client, then the application service proves it again.
  const { data: child, error } = await userClient
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("parent_user_id", user.id)
    .eq("is_archived", false)
    .maybeSingle();
  if (error || !child) return { state: "rejected" };

  const result = await ensureParentAdleTodayAssignment({
    userClient,
    serviceClient: createServiceRoleClient(),
    parentUserId: user.id,
    childId,
  });

  if (result.outcome === "ready") {
    revalidatePath("/dashboard");
    return {
      state: "ready",
      assignmentId: result.assignmentId,
      href: result.href,
    };
  }
  if (result.outcome === "completed") {
    revalidatePath("/dashboard");
    return {
      state: "completed",
      assignmentId: result.assignmentId,
      href: result.href,
    };
  }
  if (result.outcome === "no_eligible") return { state: "no_eligible" };
  if (result.outcome === "rejected") return { state: "rejected" };
  return { state: "failed" };
}
