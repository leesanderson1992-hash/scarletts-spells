import { cookies } from "next/headers";

export const ACTIVE_CHILD_COOKIE_NAME = "active_child_id";
export type AppMode = "parent" | "child";

type ChildLike = {
  id: string;
};

export function selectChildById<T extends ChildLike>(
  children: T[] | null | undefined,
  requestedChildId: string | null | undefined,
) {
  if (!children || children.length === 0) {
    return null;
  }

  return children.find((child) => child.id === requestedChildId) ?? children[0];
}

export function buildChildPath(
  pathname: string,
  childId: string | null | undefined,
) {
  if (!childId) {
    return pathname;
  }

  const searchParams = new URLSearchParams();
  searchParams.set("child", childId);

  return `${pathname}?${searchParams.toString()}`;
}

export function normaliseAppMode(mode: string | null | undefined): AppMode {
  return mode === "child" ? "child" : "parent";
}

export function buildScopedPath(
  pathname: string,
  childId: string | null | undefined,
  mode: AppMode = "parent",
) {
  const searchParams = new URLSearchParams();

  if (childId) {
    searchParams.set("child", childId);
  }

  if (mode !== "parent") {
    searchParams.set("mode", mode);
  }

  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export async function getActiveChildIdFromCookies() {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_CHILD_COOKIE_NAME)?.value ?? null;
}
