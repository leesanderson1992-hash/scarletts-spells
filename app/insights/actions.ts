"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildScopedPath, normaliseAppMode } from "@/lib/children";
import { GOLD_BAR_TO_GOLD_COIN_RATE, getAvailableGoldBars, type GoldBarLedgerEvent } from "@/lib/rewards/ledger";
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
    .select("id, gold_coin_balance")
    .eq("id", childId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!child) {
    redirect("/insights?error=We%20couldn%27t%20find%20that%20child.");
  }

  const { data: goldBarEvents } = await supabase
    .from("child_gold_bar_ledger_events")
    .select("event_type, amount")
    .eq("child_id", childId)
    .eq("parent_user_id", user.id);

  const availableGoldBars = getAvailableGoldBars((goldBarEvents ?? []) as GoldBarLedgerEvent[]);

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

  await supabase.from("child_gold_bar_ledger_events").insert({
    child_id: childId,
    parent_user_id: user.id,
    event_type: "converted",
    amount: availableGoldBars,
    source: "manual_conversion",
    notes: `Converted ${availableGoldBars} Gold Bar${availableGoldBars === 1 ? "" : "s"} into ${goldCoinsToAdd} Gold Coins.`,
  });

  await supabase.from("child_gold_coin_ledger_events").insert({
    child_id: childId,
    parent_user_id: user.id,
    event_type: "converted_from_bar",
    amount: goldCoinsToAdd,
    source: "gold_bar_conversion",
    notes: `Added ${goldCoinsToAdd} Gold Coins from Gold Bar conversion.`,
  });

  await supabase
      .from("children")
      .update({
      gold_coin_balance: (child.gold_coin_balance ?? 0) + goldCoinsToAdd,
      })
    .eq("id", childId)
    .eq("parent_user_id", user.id);

  revalidatePath("/insights");
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

  if (!Number.isInteger(requestedAmount) || requestedAmount < 1) {
    redirect(
      buildRedirectWithMessage(
        buildScopedPath("/insights", childId, safeMode),
        "error",
        "Choose at least 1 Gold Coin to request.",
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

  const [{ data: child }, { data: pendingRequests }] = await Promise.all([
    supabase
      .from("children")
      .select("id, gold_coin_balance")
      .eq("id", childId)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("gold_coin_transfer_requests")
      .select("gold_coin_amount")
      .eq("child_id", childId)
      .eq("parent_user_id", user.id)
      .eq("status", "pending"),
  ]);

  if (!child) {
    redirect("/insights?error=We%20couldn%27t%20find%20that%20child.");
  }

  const pendingAmount = (pendingRequests ?? []).reduce(
    (sum, request) => sum + (request.gold_coin_amount ?? 0),
    0,
  );
  const availableToRequest = Math.max((child.gold_coin_balance ?? 0) - pendingAmount, 0);

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

  revalidatePath("/insights");

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
      .select("id, gold_coin_balance")
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

    revalidatePath("/insights");

    redirect(
      buildRedirectWithMessage(
        buildScopedPath("/insights", childId, safeMode),
        "saved",
        "Transfer request declined.",
      ),
    );
  }

  if ((child.gold_coin_balance ?? 0) < (request.gold_coin_amount ?? 0)) {
    redirect(
      buildRedirectWithMessage(
        buildScopedPath("/insights", childId, safeMode),
        "error",
        "There are not enough Gold Coins available to approve that request.",
      ),
    );
  }

  const now = new Date().toISOString();

  await supabase
    .from("children")
    .update({
      gold_coin_balance: (child.gold_coin_balance ?? 0) - (request.gold_coin_amount ?? 0),
    })
    .eq("id", child.id)
    .eq("parent_user_id", user.id);

  await supabase.from("child_gold_coin_ledger_events").insert({
    child_id: childId,
    parent_user_id: user.id,
    event_type: "transferred",
    amount: request.gold_coin_amount,
    source: "pocket_money_transfer",
    related_entity_type: "gold_coin_transfer_request",
    related_entity_id: request.id,
    notes: `Transferred ${request.gold_coin_amount} Gold Coin${request.gold_coin_amount === 1 ? "" : "s"} after parent approval.`,
  });

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
