"use client";

import { useState } from "react";

import type {
  DeleteActionResult,
  ReorderActionResult,
  ReorderDirection,
} from "@/lib/courses/types";

function swapListItems<T>(
  items: T[],
  itemId: string,
  direction: ReorderDirection,
  getId: (item: T) => string,
) {
  const currentIndex = items.findIndex((item) => getId(item) === itemId);

  if (currentIndex === -1) {
    return null;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= items.length) {
    return null;
  }

  const reordered = [...items];
  [reordered[currentIndex], reordered[targetIndex]] = [
    reordered[targetIndex]!,
    reordered[currentIndex]!,
  ];

  return reordered;
}

export function useOptimisticReorderList<T>(input: {
  initialItems: T[];
  getId: (item: T) => string;
  normaliseItems?: (items: T[]) => T[];
}) {
  const normaliseItems = input.normaliseItems ?? ((items: T[]) => items);
  const [items, setItems] = useState(() => normaliseItems(input.initialItems));
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function moveItem(params: {
    itemId: string;
    direction: ReorderDirection;
    request: () => Promise<ReorderActionResult>;
  }) {
    if (isPending) {
      return;
    }

    const nextItems = swapListItems(items, params.itemId, params.direction, input.getId);

    if (!nextItems) {
      return;
    }

    const previousItems = items;
    setError(null);
    setIsPending(true);
    setItems(normaliseItems(nextItems));

    try {
      const result = await params.request();

      if (!result.ok) {
        setItems(previousItems);
        setError(result.error);
      }

      return result;
    } catch {
      setItems(previousItems);
      setError("We couldn't save that order change.");
      return {
        ok: false,
        error: "We couldn't save that order change.",
      } satisfies ReorderActionResult;
    } finally {
      setIsPending(false);
    }
  }

  async function removeItem(params: {
    itemId: string;
    request: () => Promise<DeleteActionResult>;
  }) {
    if (isPending) {
      return;
    }

    const nextItems = items.filter((item) => input.getId(item) !== params.itemId);

    if (nextItems.length === items.length) {
      return;
    }

    const previousItems = items;
    setError(null);
    setIsPending(true);
    setItems(normaliseItems(nextItems));

    try {
      const result = await params.request();

      if (!result.ok) {
        setItems(previousItems);
        setError(result.error);
      }

      return result;
    } catch {
      setItems(previousItems);
      setError("We couldn't delete that item.");
      return {
        ok: false,
        error: "We couldn't delete that item.",
      } satisfies DeleteActionResult;
    } finally {
      setIsPending(false);
    }
  }

  return {
    items,
    error,
    isPending,
    moveItem,
    removeItem,
  };
}
