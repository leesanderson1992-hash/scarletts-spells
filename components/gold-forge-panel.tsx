import {
  GoldBarIcon,
  GoldCoinIcon,
  NuggetIcon,
  WarmWorkshopIcon,
} from "@/components/reward-icons";

type GoldForgePanelProps = {
  nuggetCount: number;
  inMachineCount: number;
  goldBarCount: number;
  provenBagItems: Array<{ id: string; label: string }>;
  goldCoinCount: number;
  checkedInToday: boolean;
  variant?: "full" | "compact";
  nuggetsVisualCount?: number;
  warmWorkshopVisualCount?: number;
  goldBarsVisualCount?: number;
  footerMetrics?: Array<{
    label: string;
    value: number;
  }>;
};

function getPackedIconSize(count: number): "xs" | "sm" | "md" | "lg" {
  if (count >= 18) return "xs";
  if (count >= 10) return "sm";
  if (count >= 5) return "md";
  return "lg";
}

export function GoldForgePanel({
  nuggetCount,
  inMachineCount,
  goldBarCount,
  provenBagItems,
  goldCoinCount,
  checkedInToday,
  variant = "full",
  nuggetsVisualCount,
  warmWorkshopVisualCount,
  goldBarsVisualCount,
  footerMetrics,
}: GoldForgePanelProps) {
  const nuggetsCountForVisuals = Math.max(0, nuggetsVisualCount ?? nuggetCount);
  const workshopCountForVisuals = Math.max(
    0,
    warmWorkshopVisualCount ?? inMachineCount,
  );
  const barsCountForVisuals = Math.max(0, goldBarsVisualCount ?? goldBarCount);
  const nuggetIconSize = getPackedIconSize(nuggetsCountForVisuals);
  const workshopIconSize = getPackedIconSize(workshopCountForVisuals);
  const barIconSize = getPackedIconSize(barsCountForVisuals);
  const summaryMetrics = footerMetrics ?? [
    { label: "nuggets discovered", value: nuggetCount },
    { label: "warm workshop", value: inMachineCount },
    { label: "gold bars earned", value: goldBarCount },
  ];

  if (variant === "compact") {
    return (
      <div className="rounded-[1.4rem] border border-[rgba(194,24,91,0.12)] bg-[linear-gradient(180deg,#fff8fc_0%,#fff4fa_100%)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex items-center gap-1.5">
              <NuggetIcon size="sm" className={nuggetCount > 0 ? "animate-bounce" : ""} />
              <WarmWorkshopIcon size="md" />
              <GoldBarIcon />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[color:var(--ink)]">
                {nuggetCount > 0 ? "A golden nugget was discovered" : "Spelling progress is moving"}
              </p>
              <p className="text-sm text-[color:var(--mid)]">
                {inMachineCount} in Warm Workshop · {goldBarCount} gold bars earned · {checkedInToday ? "progress logged today" : "ready for today"}
              </p>
            </div>
          </div>
          <div className="min-w-[160px] flex-1 rounded-2xl border border-white/80 bg-white/75 px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-xs text-[color:var(--mid)]">
              <span>Gold Coins</span>
              <div className="flex items-center gap-2">
                <GoldCoinIcon size="sm" />
                <span className="font-semibold text-[color:var(--ink)]">{goldCoinCount}</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-[color:var(--mid)]">
              {checkedInToday ? "Coins were added from today’s logged progress." : "Coins build from approved and completed learning work."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[1.8rem] border border-[rgba(194,24,91,0.12)] bg-[linear-gradient(180deg,#fff8fc_0%,#fff4fa_100%)] p-4">
      <div className="text-center">
        <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[color:var(--scarlett)]">
          Spelling Progress
        </p>
        <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--scarlett)]">
          Nuggets become Gold Bars
        </h3>
        <p className="mt-1 text-sm text-[color:var(--mid)]">
          Words move from discovery to review to secure mastery over time.
        </p>
      </div>

      {nuggetCount > 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-[1.4rem] border border-[rgba(245,190,57,0.34)] bg-[rgba(255,247,220,0.82)] px-4 py-3">
          <NuggetIcon size="lg" className="animate-bounce" />
          <div>
            <p className="text-sm font-semibold text-[color:var(--ink)]">
              We found a golden nugget!
            </p>
            <p className="text-sm text-[color:var(--mid)]">
              That means something important is still being learned, not that anything has failed.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[112px_70px_minmax(0,1fr)_70px_112px] xl:items-center">
        <div className="justify-self-center text-center">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[color:var(--mid)]">
            Nuggets in
          </p>
          <div className="rounded-[1rem] border border-[rgba(206,71,125,0.32)] bg-[rgba(252,228,244,0.72)] p-3">
            <div className="flex min-h-[72px] flex-wrap content-end justify-center gap-1.5">
              {Array.from({ length: nuggetsCountForVisuals }).map((_, index) => (
                <NuggetIcon
                  key={`nugget-${index}`}
                  size={nuggetIconSize}
                />
              ))}
              {nuggetsCountForVisuals === 0 ? (
                <span className="text-xs text-[color:var(--mid)]">No nuggets</span>
              ) : null}
            </div>
            <div
              className="mx-auto mt-2 h-4 w-12 border-x border-[rgba(206,71,125,0.32)] bg-[rgba(252,228,244,0.72)]"
              style={{ clipPath: "polygon(12% 0%,88% 0%,100% 100%,0% 100%)" }}
            />
          </div>
        </div>

        <div className="hidden xl:block">
          <div className="relative h-3 rounded bg-[repeating-linear-gradient(90deg,#fce4f4_0,#fce4f4_9px,#e891c8_9px,#e891c8_13px)]">
            <div className="absolute inset-0 animate-pulse rounded bg-[linear-gradient(90deg,transparent,rgba(245,190,57,0.18),transparent)]" />
            <NuggetIcon size="sm" className="absolute -top-2.5 right-3 animate-bounce" />
          </div>
          <div className="mt-1 flex justify-between px-1">
            <div className="h-2 w-1 rounded-b bg-[rgba(232,145,200,0.7)]" />
            <div className="h-2 w-1 rounded-b bg-[rgba(232,145,200,0.7)]" />
            <div className="h-2 w-1 rounded-b bg-[rgba(232,145,200,0.7)]" />
          </div>
        </div>

        <div className="rounded-[1.35rem] border-2 border-[rgba(206,71,125,0.24)] bg-[linear-gradient(180deg,#fffdf2_0%,#fff1c9_58%,#ffe0a8_100%)] px-4 py-4 text-center shadow-[0_18px_40px_rgba(194,24,91,0.08)]">
          <div className="mb-3 flex flex-wrap justify-center gap-2">
            {Array.from({ length: workshopCountForVisuals }).map((_, index) => (
              <WarmWorkshopIcon
                key={`workshop-${index}`}
                size={workshopIconSize}
                className={index % 2 === 0 ? "animate-pulse" : ""}
              />
            ))}
            {workshopCountForVisuals === 0 ? (
              <span className="text-xs text-[color:var(--mid)]">No words warming</span>
            ) : null}
          </div>
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[color:var(--scarlett)]">
            Warm workshop
          </p>
          <p className="mt-1 text-4xl font-semibold text-[#f5be39]">{inMachineCount}</p>
          <p className="mt-2 text-sm text-[color:var(--ink)]">
            Active reviewed words still being strengthened
          </p>
        </div>

        <div className="hidden xl:block">
          <div className="relative h-3 rounded bg-[repeating-linear-gradient(90deg,#fce4f4_0,#fce4f4_9px,#e891c8_9px,#e891c8_13px)]">
            <div className="absolute inset-0 animate-pulse rounded bg-[linear-gradient(90deg,transparent,rgba(245,190,57,0.18),transparent)]" />
            <GoldBarIcon className="absolute -top-3 left-3 animate-pulse" />
          </div>
          <div className="mt-1 flex justify-between px-1">
            <div className="h-2 w-1 rounded-b bg-[rgba(232,145,200,0.7)]" />
            <div className="h-2 w-1 rounded-b bg-[rgba(232,145,200,0.7)]" />
            <div className="h-2 w-1 rounded-b bg-[rgba(232,145,200,0.7)]" />
          </div>
        </div>

        <div className="justify-self-center text-center">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[color:var(--mid)]">
            Gold bars earned
          </p>
          <div className="rounded-[1rem] border border-[rgba(206,71,125,0.32)] bg-[rgba(252,228,244,0.72)] p-3">
            <div className="flex min-h-[72px] flex-wrap content-end justify-center gap-1.5">
              {Array.from({ length: barsCountForVisuals }).map((_, index) => (
                <GoldBarIcon key={`bar-${index}`} size={barIconSize} />
              ))}
              {barsCountForVisuals === 0 ? (
                <span className="text-xs text-[color:var(--mid)]">No bars yet</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {summaryMetrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[1rem] border border-[var(--border)] bg-white/80 px-4 py-3 text-center"
          >
            <p className="text-2xl font-semibold text-[color:var(--scarlett)]">{metric.value}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[color:var(--mid)]">
              {metric.label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[color:var(--ink)]">Gold Bar History</p>
              <p className="text-sm text-[color:var(--mid)]">Words you have already mastered.</p>
            </div>
            <span className="rounded-full border border-emerald-200 bg-[rgba(236,253,245,0.8)] px-3 py-1 text-xs font-medium text-emerald-800">
              {provenBagItems.length} inside
            </span>
          </div>
          <div className="mt-3 flex min-h-[72px] flex-wrap gap-2 rounded-[1.2rem] border border-[rgba(46,125,50,0.14)] bg-[linear-gradient(180deg,rgba(236,253,245,0.78),rgba(255,255,255,0.92))] p-3">
            {provenBagItems.length > 0 ? (
              provenBagItems.map((item) => (
                <span
                  key={item.id}
                  className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--ink)]"
                >
                  {item.label}
                </span>
              ))
            ) : (
              <p className="text-sm text-[color:var(--mid)]">
                Gold bars will land here as secure spelling words grow.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[1.35rem] border border-[var(--border)] bg-[rgba(252,228,244,0.35)] px-4 py-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[color:var(--ink)]">Gold Coins</p>
              <p className="mt-1 text-2xl font-semibold text-[color:var(--ink)]">
                {goldCoinCount}
              </p>
              <p className="text-sm text-[color:var(--mid)]">Spendable coins saved so far.</p>
            </div>
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
              {checkedInToday ? "updated today" : "no update yet"}
            </span>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-[color:var(--mid)]">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/75 px-3 py-2">
              <span>Today&apos;s progress</span>
              <span className={checkedInToday ? "font-semibold text-emerald-700" : "font-medium text-[color:var(--mid)]"}>
                {checkedInToday ? "logged" : "not yet"}
              </span>
            </div>
            <p>
              Coins are calculated from the reward ledger after approvals, completions, conversions, and pending transfer holds.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
