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
