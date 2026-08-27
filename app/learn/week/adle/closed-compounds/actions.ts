"use server";
import { redirect } from "next/navigation";

/** Retired forward route. Historical assignments remain readable from the
 * unified ADLE session, but this action can no longer create one. */
export async function createClosedCompoundAssignmentAction() {
  redirect("/learn/week/adle");
}
