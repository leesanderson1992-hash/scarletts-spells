type RewardCelebrationProps = {
  goldCoinAmount: number;
  title?: string;
  body?: string;
};

function GoldCoinCluster() {
  return (
    <div className="reward-coins relative h-24 w-24 shrink-0">
      <svg
        aria-hidden="true"
        viewBox="0 0 120 120"
        className="h-full w-full drop-shadow-[0_12px_18px_rgba(180,120,10,0.18)]"
      >
        <defs>
          <linearGradient id="coinFace" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#fff4bf" />
            <stop offset="45%" stopColor="#ffd45c" />
            <stop offset="100%" stopColor="#efac1f" />
          </linearGradient>
          <linearGradient id="coinEdge" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#c78408" />
            <stop offset="100%" stopColor="#f0bb34" />
          </linearGradient>
        </defs>

        <g className="reward-coin reward-coin-back">
          <ellipse cx="38" cy="64" rx="24" ry="24" fill="url(#coinEdge)" />
          <ellipse cx="38" cy="60" rx="24" ry="24" fill="url(#coinFace)" />
          <ellipse cx="38" cy="60" rx="16" ry="16" fill="none" stroke="#c78408" strokeWidth="4" />
          <text x="38" y="67" textAnchor="middle" fontSize="24" fontWeight="800" fill="#9f6400">S</text>
        </g>

        <g className="reward-coin reward-coin-front">
          <ellipse cx="76" cy="56" rx="28" ry="28" fill="url(#coinEdge)" />
          <ellipse cx="76" cy="50" rx="28" ry="28" fill="url(#coinFace)" />
          <ellipse cx="76" cy="50" rx="19" ry="19" fill="none" stroke="#c78408" strokeWidth="4" />
          <text x="76" y="58" textAnchor="middle" fontSize="28" fontWeight="800" fill="#9f6400">S</text>
        </g>

        <g className="reward-coin reward-coin-small">
          <ellipse cx="90" cy="84" rx="18" ry="18" fill="url(#coinEdge)" />
          <ellipse cx="90" cy="80" rx="18" ry="18" fill="url(#coinFace)" />
          <ellipse cx="90" cy="80" rx="11" ry="11" fill="none" stroke="#c78408" strokeWidth="3" />
          <text x="90" y="85" textAnchor="middle" fontSize="16" fontWeight="800" fill="#9f6400">S</text>
        </g>

        <circle cx="22" cy="24" r="5" fill="#fff4bf" className="reward-spark reward-spark-one" />
        <circle cx="100" cy="26" r="4" fill="#ffd45c" className="reward-spark reward-spark-two" />
        <circle cx="104" cy="70" r="3.5" fill="#fff4bf" className="reward-spark reward-spark-three" />
      </svg>
    </div>
  );
}

export function RewardCelebration({
  goldCoinAmount,
  title = "You earned Gold Coins!",
  body = "Your hard work paid off and your coin balance has grown.",
}: RewardCelebrationProps) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-amber-200 bg-[linear-gradient(135deg,rgba(255,247,220,0.99),rgba(236,253,245,0.96),rgba(252,228,244,0.96))] px-5 py-5 text-emerald-900 shadow-[0_20px_44px_rgba(16,185,129,0.14)]">
      <div className="absolute -left-4 top-3 h-20 w-20 rounded-full bg-[rgba(245,190,57,0.2)]" />
      <div className="absolute right-3 top-3 h-12 w-12 rounded-full bg-[rgba(194,24,91,0.12)]" />
      <div className="absolute bottom-[-22px] right-10 h-24 w-24 rounded-full bg-[rgba(16,185,129,0.12)]" />
      <div className="relative flex items-start gap-4">
        <GoldCoinCluster />
        <div className="min-w-0">
          <p className="text-2xl font-black tracking-tight text-[color:var(--ink)]">
            {title}
          </p>
          <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-4 py-2 text-base font-black uppercase tracking-[0.14em] text-amber-700 shadow-sm animate-pulse">
            +{goldCoinAmount} Gold Coin{goldCoinAmount === 1 ? "" : "s"}
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-800">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}
