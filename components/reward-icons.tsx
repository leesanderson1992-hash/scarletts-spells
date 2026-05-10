type NuggetIconProps = {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
};

export function NuggetIcon({
  size = "md",
  className = "",
}: NuggetIconProps) {
  const sizeClasses =
    size === "lg"
      ? "h-6 w-7"
      : size === "sm"
        ? "h-3.5 w-4.5"
        : size === "xs"
          ? "h-3 w-4"
          : "h-5 w-6";

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

export function GoldBarIcon({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const sizeClasses =
    size === "lg"
      ? "h-6 w-10"
      : size === "sm"
        ? "h-4 w-6.5"
        : size === "xs"
          ? "h-3.5 w-5.5"
          : "h-5 w-8";

  return (
    <div className={`relative ${sizeClasses} ${className}`}>
      <div
        className="absolute left-0 top-0 h-[30%] w-full rounded-t-[3px]"
        style={{ background: "linear-gradient(135deg,#fff0b6,#b8860b)" }}
      />
      <div
        className="absolute left-0 top-[30%] h-[70%] w-full rounded-b-[2px] border border-[rgba(194,24,91,0.22)]"
        style={{ background: "linear-gradient(180deg,#fbe8a8,#f5be39,#be8600)" }}
      />
      <div
        className="absolute right-[-3px] top-[12%] h-[70%] w-[3px] rounded-r-[2px]"
        style={{ background: "#8b6914" }}
      />
    </div>
  );
}

export function GoldCoinIcon({
  size = "md",
  className = "",
}: {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses =
    size === "lg"
      ? "h-7 w-7"
      : size === "sm"
        ? "h-4.5 w-4.5"
        : size === "xs"
          ? "h-4 w-4"
          : "h-6 w-6";

  return (
    <div
      className={`relative ${sizeClasses} ${className} rounded-full border border-[rgba(194,24,91,0.22)]`}
      style={{
        background:
          "linear-gradient(180deg,#fff7cf 0%,#f7d56e 48%,#efb527 100%)",
        boxShadow:
          "inset 0 2px 5px rgba(255,255,255,0.85), inset 0 -2px 4px rgba(160,109,0,0.18)",
      }}
    >
      <div className="absolute inset-[18%] rounded-full border border-[rgba(255,255,255,0.72)]" />
      <div className="absolute inset-[36%] rounded-full bg-[rgba(255,241,184,0.95)] shadow-[0_0_10px_rgba(245,190,57,0.45)]" />
    </div>
  );
}

export function WarmWorkshopIcon({
  size = "md",
  className = "",
}: {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses =
    size === "lg"
      ? "h-8 w-8"
      : size === "sm"
        ? "h-5 w-5"
        : size === "xs"
          ? "h-4 w-4"
          : "h-6 w-6";

  return (
    <div
      className={`relative ${sizeClasses} ${className} rounded-full border-2 border-[rgba(206,71,125,0.28)] bg-[linear-gradient(180deg,#fff8de_0%,#fdebb4_55%,#f6d67b_100%)] shadow-[inset_0_2px_6px_rgba(255,255,255,0.8)]`}
    >
      <div className="absolute left-1/2 top-1/2 h-[28%] w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f5be39] shadow-[0_0_10px_rgba(245,190,57,0.55)]" />
    </div>
  );
}
