import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  createSupabaseDailySpellingPracticeMaterializationRepositories,
  runDailySpellingPracticeMaterialization,
} from "@/lib/writing-practice/daily-spelling-practice-materialization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getLondonDateOnly(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const partByType = new Map(parts.map((part) => [part.type, part.value]));
  const year = partByType.get("year");
  const month = partByType.get("month");
  const day = partByType.get("day");

  if (!year || !month || !day) {
    throw new Error("Unable to compute Europe/London practice date.");
  }

  return `${year}-${month}-${day}`;
}

function isValidDateOnly(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  return scheme.toLowerCase() === "bearer" && token ? token : null;
}

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function requireCronSecret(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Daily spelling practice cron secret is not configured." },
        { status: 500 },
      ),
    };
  }

  const token = getBearerToken(request);

  if (!token || !safeEquals(token, configuredSecret)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  return { ok: true as const };
}

function getPracticeDate(request: NextRequest) {
  const explicitDate = request.nextUrl.searchParams.get("date");

  if (explicitDate !== null) {
    if (isValidDateOnly(explicitDate)) {
      return explicitDate;
    }

    throw new Error("Use YYYY-MM-DD for the practice date.");
  }

  return getLondonDateOnly();
}

export async function GET(request: NextRequest) {
  const auth = requireCronSecret(request);

  if (!auth.ok) {
    return auth.response;
  }

  let practiceDate: string;

  try {
    practiceDate = getPracticeDate(request);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Invalid practice date.",
      },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  const summary = await runDailySpellingPracticeMaterialization({
    practiceDate,
    repositories: createSupabaseDailySpellingPracticeMaterializationRepositories(
      supabase,
    ),
  });

  return NextResponse.json(summary, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
