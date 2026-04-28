type GoldForgePanelProps = {
  nuggetCount: number;
  inMachineCount: number;
  goldBarCount: number;
  provenBagItems: Array<{ id: string; label: string; kind?: string }>;
  goldCoinCount: number;
  checkedInToday: boolean;
  variant?: "full" | "compact";
};

function Nugget({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sizeClasses =
    size === "lg" ? "h-6 w-7" : size === "sm" ? "h-3.5 w-4.5" : "h-5 w-6";

  return (
    <div
      className={`${sizeClasses} ${className} border border-[rgba(194,24,91,0.28)]`}
      style={{
        borderRadius: "55% 42% 48% 38%",
        background:
          "radial-gradient(circle at 36% 30%, #fff1b8 0%, #f5be39 45%, #d49b0d 70%, #a06d00 100%)",
      }}
    />
  );
}

function GoldBar({ className = "" }: { className?: string }) {
  return (
    <div className={`relative h-5 w-8 ${className}`}>
      <div
        className="absolute left-0 top-0 h-1.5 w-8 rounded-t-[3px]"
        style={{ background: "linear-gradient(135deg,#fff0b6,#b8860b)" }}
      />
      <div
        className="absolute left-0 top-1.5 h-3.5 w-8 rounded-b-[2px] border border-[rgba(194,24,91,0.22)]"
        style={{ background: "linear-gradient(180deg,#fbe8a8,#f5be39,#be8600)" }}
      />
      <div
        className="absolute right-[-3px] top-[2px] h-3.5 w-[3px] rounded-r-[2px]"
        style={{ background: "#8b6914" }}
      />
    </div>
  );
}

export function GoldForgePanel({
  nuggetCount,
  inMachineCount,
  goldBarCount,
  provenBagItems,
  goldCoinCount,
  checkedInToday,
  variant = "full",
}: GoldForgePanelProps) {
  const visibleNuggets = Math.max(1, Math.min(nuggetCount, 8));
  const visibleBars = Math.max(1, Math.min(goldBarCount, 12));

  if (variant === "compact") {
    return (
      <div className="rounded-[1.4rem] border border-[rgba(194,24,91,0.12)] bg-[linear-gradient(180deg,#fff8fc_0%,#fff4fa_100%)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Nugget size="sm" className={nuggetCount > 0 ? "animate-bounce" : ""} />
              <div className="relative h-7 w-7 rounded-full border-2 border-[rgba(206,71,125,0.28)] bg-[linear-gradient(180deg,#fff8de_0%,#fdebb4_55%,#f6d67b_100%)] shadow-[inset_0_2px_6px_rgba(255,255,255,0.8)]">
                <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f5be39] shadow-[0_0_10px_rgba(245,190,57,0.55)]" />
              </div>
              <GoldBar />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[color:var(--ink)]">
                {nuggetCount > 0 ? "A golden nugget is in the forge" : "The forge is warm"}
              </p>
              <p className="text-sm text-[color:var(--mid)]">
                {inMachineCount} refining · {goldBarCount} gold bars · {checkedInToday ? "checked in today" : "ready to log"}
              </p>
            </div>
          </div>
          <div className="min-w-[160px] flex-1 rounded-2xl border border-white/80 bg-white/75 px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-xs text-[color:var(--mid)]">
              <span>Gold Coins</span>
              <span className="font-semibold text-[color:var(--ink)]">{goldCoinCount}</span>
            </div>
            <p className="mt-1 text-xs text-[color:var(--mid)]">
              {checkedInToday ? "A daily coin was earned today." : "Daily coins come from meaningful completed sessions."}
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
          The Gold Forge
        </p>
        <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--scarlett)]">
          Golden nuggets become gold bars
        </h3>
        <p className="mt-1 text-sm text-[color:var(--mid)]">
          Things still being learned are valuable because they are being transformed.
        </p>
      </div>

      {nuggetCount > 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-[1.4rem] border border-[rgba(245,190,57,0.34)] bg-[rgba(255,247,220,0.82)] px-4 py-3">
          <Nugget size="lg" className="animate-bounce" />
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
              {Array.from({ length: visibleNuggets }).map((_, index) => (
                <Nugget
                  key={`nugget-${index}`}
                  size={index % 3 === 0 ? "lg" : index % 3 === 1 ? "md" : "sm"}
                />
              ))}
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
            <Nugget size="sm" className="absolute -top-2.5 right-3 animate-bounce" />
          </div>
          <div className="mt-1 flex justify-between px-1">
            <div className="h-2 w-1 rounded-b bg-[rgba(232,145,200,0.7)]" />
            <div className="h-2 w-1 rounded-b bg-[rgba(232,145,200,0.7)]" />
            <div className="h-2 w-1 rounded-b bg-[rgba(232,145,200,0.7)]" />
          </div>
        </div>

        <div className="rounded-[1.35rem] border-2 border-[rgba(206,71,125,0.24)] bg-[linear-gradient(180deg,#fffdf2_0%,#fff1c9_58%,#ffe0a8_100%)] px-4 py-4 text-center shadow-[0_18px_40px_rgba(194,24,91,0.08)]">
          <div className="mb-3 flex justify-center gap-2">
            <div className="relative h-7 w-7 animate-spin rounded-full border-2 border-[rgba(206,71,125,0.3)] bg-[rgba(255,255,255,0.52)]">
              <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f5be39]" />
            </div>
            <div className="relative h-7 w-7 rounded-full border-2 border-[rgba(206,71,125,0.3)] bg-[rgba(255,255,255,0.52)] [animation:spin_2.4s_linear_infinite_reverse]">
              <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f5be39]" />
            </div>
            <div className="relative h-7 w-7 animate-spin rounded-full border-2 border-[rgba(206,71,125,0.3)] bg-[rgba(255,255,255,0.52)]">
              <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f5be39]" />
            </div>
          </div>
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[color:var(--scarlett)]">
            Warm workshop
          </p>
          <p className="mt-1 text-4xl font-semibold text-[#f5be39]">{goldBarCount}</p>
          <p className="mt-2 text-sm text-[color:var(--ink)]">
            {inMachineCount} things are being worked on right now
          </p>
        </div>

        <div className="hidden xl:block">
          <div className="relative h-3 rounded bg-[repeating-linear-gradient(90deg,#fce4f4_0,#fce4f4_9px,#e891c8_9px,#e891c8_13px)]">
            <div className="absolute inset-0 animate-pulse rounded bg-[linear-gradient(90deg,transparent,rgba(245,190,57,0.18),transparent)]" />
            <GoldBar className="absolute -top-3 left-3 animate-pulse" />
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
              {Array.from({ length: visibleBars }).map((_, index) => (
                <GoldBar key={`bar-${index}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-[1rem] border border-[var(--border)] bg-white/80 px-4 py-3 text-center">
          <p className="text-2xl font-semibold text-[color:var(--scarlett)]">{nuggetCount}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[color:var(--mid)]">
            nuggets waiting
          </p>
        </div>
        <div className="rounded-[1rem] border border-[var(--border)] bg-white/80 px-4 py-3 text-center">
          <p className="text-2xl font-semibold text-[color:var(--scarlett)]">{inMachineCount}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[color:var(--mid)]">
            in the machine
          </p>
        </div>
        <div className="rounded-[1rem] border border-[var(--border)] bg-white/80 px-4 py-3 text-center">
          <p className="text-2xl font-semibold text-[color:var(--scarlett)]">{goldBarCount}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[color:var(--mid)]">
            gold bars made
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[color:var(--ink)]">Proven Bag</p>
              <p className="text-sm text-[color:var(--mid)]">Secure things you can now truly own.</p>
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
                Gold bars will land here as secure words, finished tasks, and completed focus work grow.
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
              {checkedInToday ? "+1 today" : "not earned today"}
            </span>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-[color:var(--mid)]">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/75 px-3 py-2">
              <span>Today&apos;s check-in</span>
              <span className={checkedInToday ? "font-semibold text-emerald-700" : "font-medium text-[color:var(--mid)]"}>
                {checkedInToday ? "+ moved today" : "not yet"}
              </span>
            </div>
            <p>
              Every secure piece of knowledge adds to the stockpile. Perfection is not needed for the forge to keep working.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
