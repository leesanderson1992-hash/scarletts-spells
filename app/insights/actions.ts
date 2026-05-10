"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildScopedPath, normaliseAppMode } from "@/lib/children";
import { awardGoldCoins, spendGoldCoins } from "@/lib/rewards/course-coins";
import { getChildRewardLedgerReadModel, GOLD_BAR_TO_GOLD_COIN_RATE } from "@/lib/rewards/read-model";
import { confirmPositiveEvidenceSuggestions } from "@/lib/writing-practice/positive-evidence";
import { markGoldBarConverted } from "@/lib/rewards/spelling-rewards";
import { createClient } from "@/lib/supabase/server";

function buildRedirectWithMessage(
  path: string,
  key: "error" | "saved",
  value: string,
) {
  const [pathname, rawQuery] = path.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");
  searchParams.set(key, value);
  const nextQuery = searchParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function revalidateInsightsOnly() {
  revalidatePath("/insights");
}

function parseSuggestionIdList(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return [] as string[];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

export async function confirmInsightsPositiveEvidence(formData: FormData) {
  const childId = formData.get("child_id");
  const mode = formData.get("mode");
  const suggestionId = formData.get("suggestion_id");
  const safeMode = normaliseAppMode(typeof mode === "string" ? mode : undefined);

  if (
    typeof childId !== "string" ||
    !childId ||
    typeof suggestionId !== "string" ||
    !suggestionId
  ) {
    redirect("/insights?error=We%20couldn%27t%20find%20that%20transfer%20evidence.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const summary = await confirmPositiveEvidenceSuggestions({
    supabase,
    parentUserId: user.id,
    childId,
    suggestionIds: [suggestionId],
    surface: "insights",
    maxConfirmCount: 1,
  });

  revalidateInsightsOnly();

  redirect(
    buildRedirectWithMessage(
      buildScopedPath("/insights", childId, safeMode),
      summary.confirmedCount > 0 ? "saved" : "error",
      summary.confirmedCount > 0
        ? "Transfer evidence confirmed from insights."
        : "That transfer evidence could not be confirmed here.",
    ),
  );
}

export async function bulkConfirmInsightsPositiveEvidence(formData: FormData) {
  const childId = formData.get("child_id");
  const mode = formData.get("mode");
  const suggestionIds = parseSuggestionIdList(formData.get("suggestion_ids"));
  const safeMode = normaliseAppMode(typeof mode === "string" ? mode : undefined);

  if (typeof childId !== "string" || !childId || suggestionIds.length === 0) {
    redirect("/insights?error=We%20couldn%27t%20find%20those%20transfer%20matches.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const summary = await confirmPositiveEvidenceSuggestions({
    supabase,
    parentUserId: user.id,
    childId,
    suggestionIds,
    surface: "insights",
    maxConfirmCount: 3,
  });

  revalidateInsightsOnly();

  redirect(
    buildRedirectWithMessage(
      buildScopedPath("/insights", childId, safeMode),
      summary.confirmedCount > 0 ? "saved" : "error",
      summary.confirmedCount > 0
        ? `Confirmed ${summary.confirmedCount} transfer match${
            summary.confirmedCount === 1 ? "" : "es"
          } from insights.`
        : "No eligible transfer matches were ready to confirm.",
    ),
  );
}

export async function convertGoldBarsToCoins(formData: FormData) {
  const childId = formData.get("child_id");
  const mode = formData.get("mode");
  const safeMode = normaliseAppMode(typeof mode === "string" ? mode : undefined);

  if (typeof childId !== "string" || !childId) {
    redirect("/insights?error=We%20couldn%27t%20find%20that%20child.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: child } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!child) {
    redirect("/insights?error=We%20couldn%27t%20find%20that%20child.");
  }

  const { data: availableBarRows } = await supabase
    .from("spelling_reward_states")
    .select("target_word")
    .eq("child_id", childId)
    .eq("parent_user_id", user.id)
    .eq("reward_state", "gold_bar_earned")
    .eq("has_converted_gold_bar", false);

  const redeemableGoldBarWords = (availableBarRows ?? [])
    .filter((row) => Boolean((row as { target_word?: string }).target_word));
  const availableGoldBars = redeemableGoldBarWords.length;

  if (availableGoldBars < 1) {
    redirect(
      buildRedirectWithMessage(
        buildScopedPath("/insights", childId, safeMode),
        "error",
        "No Gold Bars are ready to convert yet.",
      ),
    );
  }

  const goldCoinsToAdd = availableGoldBars * GOLD_BAR_TO_GOLD_COIN_RATE;

  await markGoldBarConverted({
    supabase,
    childId,
    parentUserId: user.id,
    targetWords: redeemableGoldBarWords.map((row) => (row as { target_word: string }).target_word),
  });

  await awardGoldCoins({
    supabase,
    parentUserId: user.id,
    childId,
    amount: goldCoinsToAdd,
    eventType: "converted_from_bar",
    source: "gold_bar_conversion",
    relatedEntityType: "gold_bar_conversion",
    relatedEntityId: redeemableGoldBarWords
      .map((row) => row.target_word)
      .sort()
      .join("|"),
    notes: `Added ${goldCoinsToAdd} Gold Coins from Gold Bar conversion.`,
  });

  revalidateInsightsOnly();
  revalidatePath("/dashboard");
  revalidatePath("/learn/week");

  redirect(
    buildRedirectWithMessage(
      buildScopedPath("/insights", childId, safeMode),
      "saved",
      `${availableGoldBars} Gold Bar${availableGoldBars === 1 ? "" : "s"} converted into ${goldCoinsToAdd} Gold Coins`,
    ),
  );
}

export async function requestGoldCoinTransfer(formData: FormData) {
  const childId = formData.get("child_id");
  const mode = formData.get("mode");
  const amount = formData.get("gold_coin_amount");
  const childNote = formData.get("child_note");
  const safeMode = normaliseAppMode(typeof mode === "string" ? mode : undefined);

  if (typeof childId !== "string" || !childId) {
    redirect("/insights?error=We%20couldn%27t%20find%20that%20child.");
  }

  const requestedAmount = typeof amount === "string" ? Number(amount) : NaN;

  if (
    !Number.isInteger(requestedAmount) ||
    requestedAmount < 100 ||
    requestedAmount % 100 !== 0
  ) {
    redirect(
      buildRedirectWithMessage(
        buildScopedPath("/insights", childId, safeMode),
        "error",
        "Requests must be in 100 Gold Coin blocks.",
      ),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: child }, rewardLedgerReadModel] = await Promise.all([
    supabase
      .from("children")
      .select("id")
      .eq("id", childId)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    getChildRewardLedgerReadModel({
      supabase,
      parentUserId: user.id,
      childId,
    }),
  ]);

  if (!child) {
    redirect("/insights?error=We%20couldn%27t%20find%20that%20child.");
  }

  const availableToRequest = rewardLedgerReadModel.spendableSnapshot.spendableGoldCoins;

  if (requestedAmount > availableToRequest) {
    redirect(
      buildRedirectWithMessage(
        buildScopedPath("/insights", childId, safeMode),
        "error",
        "That request is bigger than the coins currently available to request.",
      ),
    );
  }

  await supabase.from("gold_coin_transfer_requests").insert({
    child_id: childId,
    parent_user_id: user.id,
    gold_coin_amount: requestedAmount,
    status: "pending",
    child_note: typeof childNote === "string" && childNote.trim() ? childNote.trim() : null,
  });

  revalidateInsightsOnly();

  redirect(
    buildRedirectWithMessage(
      buildScopedPath("/insights", childId, safeMode),
      "saved",
      `Requested ${requestedAmount} Gold Coin${requestedAmount === 1 ? "" : "s"} for parent transfer`,
    ),
  );
}

export async function decideGoldCoinTransferRequest(formData: FormData) {
  const childId = formData.get("child_id");
  const requestId = formData.get("request_id");
  const mode = formData.get("mode");
  const decision = formData.get("decision");
  const parentNote = formData.get("parent_note");
  const safeMode = normaliseAppMode(typeof mode === "string" ? mode : undefined);

  if (
    typeof childId !== "string" ||
    !childId ||
    typeof requestId !== "string" ||
    !requestId ||
    (decision !== "approve" && decision !== "decline")
  ) {
    redirect("/insights?error=We%20couldn%27t%20process%20that%20transfer%20request.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: request }, { data: child }] = await Promise.all([
    supabase
      .from("gold_coin_transfer_requests")
      .select("id, gold_coin_amount, status")
      .eq("id", requestId)
      .eq("child_id", childId)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("children")
      .select("id")
      .eq("id", childId)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
  ]);

  if (!request || !child || request.status !== "pending") {
    redirect(
      buildRedirectWithMessage(
        buildScopedPath("/insights", childId, safeMode),
        "error",
        "That transfer request is no longer pending.",
      ),
    );
  }

  if (decision === "decline") {
    await supabase
      .from("gold_coin_transfer_requests")
      .update({
        status: "declined",
        parent_note: typeof parentNote === "string" && parentNote.trim() ? parentNote.trim() : null,
        declined_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", request.id)
      .eq("parent_user_id", user.id);

    revalidateInsightsOnly();

    redirect(
      buildRedirectWithMessage(
        buildScopedPath("/insights", childId, safeMode),
        "saved",
        "Transfer request declined.",
      ),
    );
  }

  if ((request.gold_coin_amount ?? 0) < 1) {
    redirect(
      buildRedirectWithMessage(
        buildScopedPath("/insights", childId, safeMode),
        "error",
        "There are not enough Gold Coins available to approve that request.",
      ),
    );
  }

  const now = new Date().toISOString();

  const transferred = await spendGoldCoins({
    supabase,
    parentUserId: user.id,
    childId,
    amount: request.gold_coin_amount,
    source: "pocket_money_transfer",
    relatedEntityType: "gold_coin_transfer_request",
    relatedEntityId: request.id,
    notes: `Transferred ${request.gold_coin_amount} Gold Coin${request.gold_coin_amount === 1 ? "" : "s"} after parent approval.`,
  });

  if (!transferred) {
    redirect(
      buildRedirectWithMessage(
        buildScopedPath("/insights", childId, safeMode),
        "error",
        "There are not enough Gold Coins available to approve that request.",
      ),
    );
  }

  await supabase
    .from("gold_coin_transfer_requests")
    .update({
      status: "approved",
      parent_note: typeof parentNote === "string" && parentNote.trim() ? parentNote.trim() : null,
      approved_at: now,
      fulfilled_at: now,
      updated_at: now,
    })
    .eq("id", request.id)
    .eq("parent_user_id", user.id);

  revalidatePath("/insights");
  revalidatePath("/dashboard");
  revalidatePath("/learn/week");

  redirect(
    buildRedirectWithMessage(
      buildScopedPath("/insights", childId, safeMode),
      "saved",
      `Approved ${request.gold_coin_amount} Gold Coin${request.gold_coin_amount === 1 ? "" : "s"} for transfer`,
    ),
  );
}
