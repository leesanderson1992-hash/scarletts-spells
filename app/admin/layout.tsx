import { headers } from "next/headers";

import { requireAdminUser } from "@/lib/admin/access";
import { requireDynamicPrefixQaUser } from "@/lib/adle/morphology/dynamic-prefix-qa-access";
import { DYNAMIC_PREFIX_QA_PATH } from "@/lib/adle/morphology/dynamic-prefix-qa-policy";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = (await headers()).get("x-scarletts-pathname");
  if (pathname === DYNAMIC_PREFIX_QA_PATH) {
    await requireDynamicPrefixQaUser();
  } else {
    await requireAdminUser();
  }

  return children;
}
