import { requireAdminUser } from "@/lib/admin/access";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdminUser();

  return children;
}
