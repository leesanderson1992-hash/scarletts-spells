"use client";

import Link from "next/link";

import { builderIconButtonClass } from "@/app/courses/components/builder-control-styles";
import type {
  FinalReviewActionKind,
  FinalReviewAuditViewModel,
  FinalReviewItemViewModel,
  ReorderActionResult,
  ReorderDirection,
} from "@/lib/courses/types";
import { useOptimisticReorderList } from "@/app/courses/components/use-optimistic-reorder-list";

type FinalReviewAuditProps = {
  model: FinalReviewAuditViewModel;
  reorderModuleAction: (input: {
    moduleId: string;
    direction: ReorderDirection;
  }) => Promise<ReorderActionResult>;
  reorderTaskAction: (input: {
    taskId: string;
    direction: ReorderDirection;
  }) => Promise<ReorderActionResult>;
  reorderFocusBlockAction: (input: {
    focusBlockId: string;
    direction: ReorderDirection;
  }) => Promise<ReorderActionResult>;
  reorderCheckpointAction: (input: {
    checkpointId: string;
    direction: ReorderDirection;
  }) => Promise<ReorderActionResult>;
};

function getMoveAction(kind: FinalReviewActionKind, actions: FinalReviewAuditProps) {
  switch (kind) {
    case "module":
      return {
        action: (id: string, direction: ReorderDirection) =>
          actions.reorderModuleAction({ moduleId: id, direction }),
      };
    case "focus_block":
      return {
        action: (id: string, direction: ReorderDirection) =>
          actions.reorderFocusBlockAction({ focusBlockId: id, direction }),
      };
    case "checkpoint":
      return {
        action: (id: string, direction: ReorderDirection) =>
          actions.reorderCheckpointAction({ checkpointId: id, direction }),
      };
    default:
      return {
        action: (id: string, direction: ReorderDirection) =>
          actions.reorderTaskAction({ taskId: id, direction }),
      };
  }
}

function normaliseAuditItems(items: FinalReviewItemViewModel[]) {
  return items.map((item, index) => {
    if (!item.moveEntityId) {
      return item;
    }

    return {
      ...item,
      canMoveUp: index > 0,
      canMoveDown: index < items.length - 1,
    };
  });
}

function ActionIcon({
  type,
}: {
  type: "edit" | "up" | "down";
}) {
  if (type === "edit") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
        <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 .8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
      </svg>
    );
  }

  if (type === "up") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
        <path d="M10 4.6 5.7 8.9a1 1 0 0 1-1.4-1.4l5-5a1 1 0 0 1 1.4 0l5 5a1 1 0 1 1-1.4 1.4L11 4.6V17a1 1 0 1 1-2 0V4.6Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
      <path d="M10 15.4 14.3 11.1a1 1 0 0 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 1.4-1.4L9 15.4V3a1 1 0 1 1 2 0v12.4Z" />
    </svg>
  );
}

function RenderAuditItem({
  item,
  actions,
  listIsPending,
  moveItem,
}: {
  item: FinalReviewItemViewModel;
  actions: FinalReviewAuditProps;
  listIsPending: boolean;
  moveItem: (params: {
    itemId: string;
    direction: ReorderDirection;
    request: () => Promise<ReorderActionResult>;
  }) => Promise<ReorderActionResult | undefined>;
}) {
  const hasChildren = Boolean(item.children?.length);
  const moveConfig = getMoveAction(item.kind, actions);

  const actionButtons = (
    <div className="flex items-center gap-2">
      {item.editHref ? (
        <Link
          href={item.editHref}
          className={builderIconButtonClass()}
          title={`Open ${item.title}`}
          aria-label={`Open ${item.title}`}
        >
          <ActionIcon type="edit" />
        </Link>
      ) : null}

      {item.canMoveUp !== undefined && item.moveEntityId ? (
        <button
          type="button"
          disabled={listIsPending || !item.canMoveUp}
          onClick={() =>
            moveItem({
              itemId: item.id,
              direction: "up",
              request: () => moveConfig.action(item.moveEntityId!, "up"),
            })
          }
          className={builderIconButtonClass()}
          title={`Move ${item.title} up`}
          aria-label={`Move ${item.title} up`}
        >
          <ActionIcon type="up" />
        </button>
      ) : null}

      {item.canMoveDown !== undefined && item.moveEntityId ? (
        <button
          type="button"
          disabled={listIsPending || !item.canMoveDown}
          onClick={() =>
            moveItem({
              itemId: item.id,
              direction: "down",
              request: () => moveConfig.action(item.moveEntityId!, "down"),
            })
          }
          className={builderIconButtonClass()}
          title={`Move ${item.title} down`}
          aria-label={`Move ${item.title} down`}
        >
          <ActionIcon type="down" />
        </button>
      ) : null}
    </div>
  );

  if (hasChildren) {
    return (
      <details
        key={item.id}
        className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5"
        open={item.defaultOpen}
      >
        <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-[color:var(--ink)]">{item.title}</p>
              {item.badgeLabel ? (
                <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--mid)]">
                  {item.badgeLabel}
                </span>
              ) : null}
            </div>
            {item.detail ? <p className="mt-1 text-sm text-[color:var(--mid)]">{item.detail}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {item.stats?.map((stat) => (
              <span
                key={`${item.id}-${stat}`}
                className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[color:var(--mid)]"
              >
                {stat}
              </span>
            ))}
            {actionButtons}
          </div>
        </summary>

        <div className="mt-3 grid gap-2 pl-2">
          <AuditItemList
            key={(item.children ?? [])
              .map((child) => `${child.id}:${child.title}:${child.detail ?? ""}`)
              .join("|")}
            items={item.children ?? []}
            actions={actions}
          />
        </div>
      </details>
    );
  }

  return (
    <div key={item.id} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-[color:var(--ink)]">{item.title}</p>
            {item.badgeLabel ? (
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--mid)]">
                {item.badgeLabel}
              </span>
            ) : null}
          </div>
          {item.detail ? <p className="mt-1 text-sm text-[color:var(--mid)]">{item.detail}</p> : null}
          {item.notes ? <p className="mt-1 text-xs text-[color:var(--mid)]">{item.notes}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {item.stats?.map((stat) => (
            <span
              key={`${item.id}-${stat}`}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[color:var(--mid)]"
            >
              {stat}
            </span>
          ))}
          {actionButtons}
        </div>
      </div>
    </div>
  );
}

function AuditItemList({
  items,
  actions,
}: {
  items: FinalReviewItemViewModel[];
  actions: FinalReviewAuditProps;
}) {
  const { items: orderedItems, error, isPending, moveItem } = useOptimisticReorderList({
    initialItems: items,
    getId: (item) => item.id,
    normaliseItems: normaliseAuditItems,
  });

  return (
    <>
      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {orderedItems.map((item) => (
        <RenderAuditItem
          key={item.id}
          item={item}
          actions={actions}
          listIsPending={isPending}
          moveItem={moveItem}
        />
      ))}
    </>
  );
}

export function FinalReviewAudit({
  model,
  reorderModuleAction,
  reorderTaskAction,
  reorderFocusBlockAction,
  reorderCheckpointAction,
}: FinalReviewAuditProps) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
            {model.heading}
          </h2>
          <p className="mt-1 max-w-4xl text-sm text-[color:var(--mid)]">{model.description}</p>
        </div>
        {model.gaps.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {model.gaps.map((gap) => (
              <Link
                key={`${gap.step}-${gap.label}`}
                href={gap.href}
                className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:text-[var(--scarlett)]"
              >
                Step {gap.step}: {gap.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {model.stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5"
          >
            <p className="brand-eyebrow">{stat.label}</p>
            <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
              {model.primarySection.title}
            </p>
            <p className="mt-1 text-sm text-[color:var(--mid)]">{model.primarySection.description}</p>
          </div>
          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[color:var(--mid)]">
            {model.primarySection.badgeLabel}
          </span>
        </div>

        {model.primarySection.groups.length > 0 ? (
          <div className="mt-3 grid gap-3">
                  {model.primarySection.groups.map((group) => (
              <details
                key={group.id}
                className={`rounded-2xl border px-3 py-3 ${
                  group.isHighlighted
                    ? "border-[var(--scarlett)] bg-[rgba(252,228,244,0.2)]"
                    : "border-[var(--border)] bg-[rgba(255,247,220,0.22)]"
                }`}
                open={group.isHighlighted}
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[color:var(--ink)]">{group.title}</p>
                      {group.statusLabel ? (
                        <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--mid)]">
                          {group.statusLabel}
                        </span>
                      ) : null}
                    </div>
                    {group.detail ? (
                      <p className="mt-1 text-xs text-[color:var(--mid)]">{group.detail}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--mid)]">
                    {group.stats.map((stat) => (
                      <span
                        key={`${group.id}-${stat}`}
                        className="rounded-full border border-[var(--border)] bg-white px-3 py-1"
                      >
                        {stat}
                      </span>
                    ))}
                  </div>
                </summary>

                <div className="mt-3 grid gap-2">
                  {group.items.length > 0 ? (
                    <AuditItemList
                      key={`${group.id}:${group.items
                        .map((item) => `${item.id}:${item.title}:${item.detail ?? ""}`)
                        .join("|")}`}
                      items={group.items}
                      actions={{
                        model,
                        reorderModuleAction,
                        reorderTaskAction,
                        reorderFocusBlockAction,
                        reorderCheckpointAction,
                      }}
                    />
                  ) : (
                    <p className="text-sm text-[color:var(--mid)]">{model.primarySection.emptyMessage}</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[color:var(--mid)]">{model.primarySection.emptyMessage}</p>
        )}
      </div>
    </>
  );
}
