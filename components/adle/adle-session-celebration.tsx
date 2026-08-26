/**
 * ADLE Slice 7a (7a-D): the full-page end-of-session celebration. Server-
 * renderable (CSS-keyframe animations only), it replaces the plain "all done"
 * card when today's spelling is complete. Reuses the reward icon layer; fun
 * lands here, at the end — never over the input while a child is spelling.
 */

import Link from "next/link";

import { GoldBarIcon, NuggetIcon, WarmWorkshopIcon } from "@/components/reward-icons";
import type { AdleSessionCelebrationModel } from "@/lib/rewards/adle-session-celebration";

export function AdleSessionCelebration(props: {
  model: AdleSessionCelebrationModel;
  planDate: string;
  backPath: string;
}) {
  const { model } = props;
  const bars = model.goldenBarsToday;
  const forged = model.forgedTodayWords;

  return (
    <section className="adle-presentation review-scene rounded-3xl p-5 md:p-7 text-center">
      <p className="review-eyebrow">All done for today</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-[color:var(--review-text)]">
        You finished today&apos;s spelling! 🎉
      </h2>
      <p className="mt-1 text-sm text-[color:var(--review-muted)]">{props.planDate}</p>

      {bars.length > 0 ? (
        <div className="mt-5 rounded-3xl border border-[color:var(--gold)] bg-[color:var(--gold)]/10 px-4 py-5">
          <div className="flex justify-center">
            <GoldBarIcon size="lg" className="motion-safe:animate-bounce" />
          </div>
          <p className="mt-2 text-lg font-semibold text-[color:var(--review-accent)]">
            {bars.length === 1 ? "You earned a Golden Bar!" : `You earned ${bars.length} Golden Bars!`}
          </p>
          <p className="mt-1 text-sm text-[color:var(--review-text)]">
            Your real writing proved you know{" "}
            <span className="font-semibold">{formatWordList(bars)}</span>. That&apos;s the whole
            journey — nugget to bar.
          </p>
        </div>
      ) : null}

      {forged.length > 0 ? (
        <div className="mt-5 rounded-3xl border border-[var(--review-border)] bg-slate-950/40 px-4 py-5">
          <div className="flex items-center justify-center gap-2">
            <WarmWorkshopIcon size="lg" className="motion-safe:animate-pulse" />
            <p className="text-base font-semibold text-[color:var(--review-text)]">Into the Workshop!</p>
          </div>
          <p className="mt-1 text-sm text-[color:var(--review-muted)]">
            {forged.length === 1 ? "Your word is" : `Your ${forged.length} words are`} being forged.
            Use {forged.length === 1 ? "it" : "them"} in your writing to earn a Golden Bar.
          </p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {forged.map((word) => (
              <li
                key={word}
                className="inline-flex items-center gap-1.5 rounded-full bg-cyan-300/10 px-3 py-1 text-sm font-semibold text-[color:var(--review-text)]"
              >
                <NuggetIcon size="sm" />
                {word}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!model.hasSomethingToCelebrate ? (
        <p className="mt-4 text-sm text-emerald-200">Great work today — see you tomorrow.</p>
      ) : (
        <p className="mt-5 text-sm text-[color:var(--review-muted)]">See you tomorrow. 🌙</p>
      )}

      <Link href={props.backPath} className="review-primary mt-5 inline-flex min-h-11 items-center">
        Back to my week
      </Link>
    </section>
  );
}

/** "a", "a and b", or "a, b and c" — child-friendly list join. */
function formatWordList(words: readonly string[]): string {
  if (words.length <= 1) {
    return words[0] ?? "";
  }
  if (words.length === 2) {
    return `${words[0]} and ${words[1]}`;
  }
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
