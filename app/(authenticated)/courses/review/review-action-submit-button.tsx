"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Hold completion while a newly added item has not yet been read back from the server. */
export function ReviewActionSubmitButton(props: {
  disabled: boolean;
  className: string;
  children: ReactNode;
}) {
  const [newItemPendingRefresh, setNewItemPendingRefresh] = useState(false);
  useEffect(() => {
    const onAdded = () => setNewItemPendingRefresh(true);
    const onRefreshed = () => setNewItemPendingRefresh(false);
    window.addEventListener("review-word-added", onAdded);
    window.addEventListener("review-data-refreshed", onRefreshed);
    return () => {
      window.removeEventListener("review-word-added", onAdded);
      window.removeEventListener("review-data-refreshed", onRefreshed);
    };
  }, []);
  return <button type="submit" className={props.className}
    disabled={props.disabled || newItemPendingRefresh}
    title={newItemPendingRefresh ? "Open the updated Context or Misspellings section before completing review." : undefined}>
    {props.children}
  </button>;
}
