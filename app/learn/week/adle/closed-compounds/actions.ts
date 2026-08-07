"use server";
import { redirect } from "next/navigation";
import { buildScopedPath, findChildById } from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { getLondonPracticeDate } from "@/lib/practice-date";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { composeDailyPlan } from "@/lib/adle/daily-assignment-composer";
import { getExistingAdleSessionPlanId, persistComposedAdleDailyPlan } from "@/lib/adle/loaders/daily-plan-surface";
import { loadDailyPlanFacts } from "@/lib/adle/loaders/composer-facts-loader";
import { buildClosedCompoundAssignmentPlan } from "@/lib/adle/morphology/closed-compound-assignment-plan";
import { compileClosedCompoundLesson } from "@/lib/adle/morphology/closed-compound-word-lab";
import { loadClosedCompoundProfiles } from "@/lib/adle/morphology/closed-compound-profile-loader";
import { isClosedCompoundRouteEnabled } from "@/lib/adle/morphology/closed-compound-route-gate";
export async function createClosedCompoundAssignmentAction(formData: FormData) { const childId=String(formData.get("childId")??""); if(!childId||!isClosedCompoundRouteEnabled())redirect("/learn/week"); const userClient=await createClient();const {data:{user}}=await userClient.auth.getUser();if(!user||!findChildById(await getActiveChildrenForUser(userClient,user.id),childId))redirect("/learn/week");const planDate=getLondonPracticeDate();if(await getExistingAdleSessionPlanId({userClient,parentUserId:user.id,childId,planDate}))redirect(buildScopedPath("/learn/week/adle",childId,"child"));const serviceClient=createServiceRoleClient();const loaded=await loadClosedCompoundProfiles(serviceClient,childId,{allowStagingProfiles:process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT === "staging"});const payload=loaded.profiles.map((profile)=>compileClosedCompoundLesson(profile,loaded.learningItems)).find(Boolean);if(!payload)redirect(buildScopedPath("/learn/week/adle/closed-compounds",childId,"child"));const {facts}=await loadDailyPlanFacts(serviceClient,{childId,today:planDate});const plan=buildClosedCompoundAssignmentPlan(composeDailyPlan(facts,planDate),payload);await persistComposedAdleDailyPlan({userClient,serviceClient,parentUserId:user.id,childId,planDate,plan});redirect(buildScopedPath("/learn/week/adle",childId,"child")); }
