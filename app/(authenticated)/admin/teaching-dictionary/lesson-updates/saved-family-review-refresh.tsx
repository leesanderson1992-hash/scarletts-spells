"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function SavedFamilyReviewRefresh({ skill, signature, pending }: { skill: string; signature: string; pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const controller = new AbortController(); let attempts = 0, inFlight = false;
    const interval = setInterval(async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      if (++attempts > 12) { clearInterval(interval); return; }
      inFlight = true;
      try {
        const result = await fetch(`/api/admin/teaching-dictionary/family-dependencies/status?skill=${encodeURIComponent(skill)}`, { signal: controller.signal });
        if (!result.ok) { clearInterval(interval); return; }
        if (JSON.stringify(await result.json()) !== signature) { clearInterval(interval); router.refresh(); }
      } catch { clearInterval(interval); }
      finally { inFlight = false; }
    }, pending ? 5000 : 15000);
    return () => { clearInterval(interval); controller.abort(); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [skill, signature, pending, router]);
  return <button type="button" className="w-fit text-sm underline" onClick={() => router.refresh()}>Refresh saved review status</button>;
}
