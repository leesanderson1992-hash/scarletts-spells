"use client";

export default function PageError({ retry }: { error: unknown; retry: () => void }) {
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-8 text-[color:var(--ink)]">
    <p className="font-semibold text-[color:var(--scarlett)]">✧ Scarlett Spells</p>
    <h1 className="text-2xl font-semibold">This page couldn’t load</h1>
    <p>A temporary connection issue may be stopping it. Try again to reload this page.</p>
    <button type="button" onClick={() => retry()} className="self-start rounded-lg bg-[var(--scarlett)] px-5 py-3 font-semibold text-white">Try again</button>
  </main>;
}
