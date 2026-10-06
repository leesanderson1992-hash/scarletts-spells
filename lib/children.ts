import { cookies } from "next/headers";

import { ACTIVE_CHILD_COOKIE_NAME } from "./children-shared";
export * from "./children-shared";

export async function getActiveChildIdFromCookies() {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_CHILD_COOKIE_NAME)?.value ?? null;
}
