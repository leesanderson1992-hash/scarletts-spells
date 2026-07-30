import { setActiveChildContext } from "@/app/children/actions";

type ChildOption = {
  id: string;
  first_name: string;
  last_name: string | null;
};

type ChildSwitcherProps = {
  childOptions: ChildOption[];
  activeChildId: string;
  redirectPath: string;
  compact?: boolean;
  className?: string;
};

function getChildName(child: ChildOption) {
  return [child.first_name, child.last_name].filter(Boolean).join(" ");
}

export function ChildSwitcher({
  childOptions,
  activeChildId,
  redirectPath,
  compact = false,
  className,
}: ChildSwitcherProps) {
  if (childOptions.length <= 1) {
    return null;
  }

  const activeChild = childOptions.find((child) => child.id === activeChildId) ?? null;

  if (compact) {
    return (
      <details className={`relative ${className ?? ""}`.trim()}>
        <summary className="brand-secondary-btn flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full px-3 text-xs font-medium sm:text-sm">
          <span className="max-w-44 truncate">{activeChild ? getChildName(activeChild) : "Choose learner"}</span>
          <span aria-hidden="true" className="text-[10px]">⌄</span>
          <span className="sr-only">Switch learner</span>
        </summary>
        <div className="brand-card-soft absolute left-0 top-full z-50 mt-2 grid max-h-80 min-w-64 gap-2 overflow-y-auto rounded-2xl p-2 shadow-[0_18px_40px_rgba(76,24,66,0.18)]">
          <p className="px-2 pt-1 text-xs font-medium text-[var(--mid)]">Switch learner</p>
          {childOptions.map((child) => {
            const isSelected = child.id === activeChildId;

            return (
              <form key={child.id} action={setActiveChildContext}>
                <input type="hidden" name="child_id" value={child.id} />
                <input type="hidden" name="redirect_path" value={redirectPath} />
                <button
                  type="submit"
                  className={`flex min-h-10 w-full items-center rounded-xl px-3 text-left text-sm font-medium transition ${
                    isSelected
                      ? "bg-[linear-gradient(135deg,var(--scarlett),#d53d81)] text-white"
                      : "text-[var(--mid)] hover:bg-white/80 hover:text-[var(--scarlett)]"
                  }`}
                >
                  {getChildName(child)}
                </button>
              </form>
            );
          })}
        </div>
      </details>
    );
  }

  return (
    <div className={`${compact ? "flex flex-wrap gap-2" : "mt-6 flex flex-wrap gap-2"} ${className ?? ""}`.trim()}>
      {childOptions.map((child) => {
        const isSelected = child.id === activeChildId;

        return (
          <form key={child.id} action={setActiveChildContext}>
            <input type="hidden" name="child_id" value={child.id} />
            <input type="hidden" name="redirect_path" value={redirectPath} />
            <button
              type="submit"
              className={`inline-flex items-center justify-center rounded-full px-4 text-sm font-medium transition ${
                isSelected
                  ? "brand-primary-btn"
                  : "brand-secondary-btn"
              } ${compact ? "min-h-10 px-3 text-xs sm:text-sm" : "h-11"}`}
            >
              {getChildName(child)}
            </button>
          </form>
        );
      })}
    </div>
  );
}
