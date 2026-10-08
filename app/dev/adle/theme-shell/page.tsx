import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";

export default async function ThemeShellFixture({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const path = (await searchParams).path === "/dashboard" ? "/dashboard" : "/learn/week/adle";
  return <AppShell currentPath={path} mode={path === "/dashboard" ? "parent" : "child"} activeChildId={null} availableChildren={[]} userEmail="preview@example.test">
    <section className="brand-page brand-card rounded-3xl p-6"><h1 className="brand-title text-3xl">Theme navigation fixture</h1><p className="brand-copy">The selected appearance applies here and on other pages.</p></section>
  </AppShell>;
}
