"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LessonFilter({ lessons, selected }: {
  lessons: { key: string; label: string }[];
  selected: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const matches = lessons.filter(lesson => lesson.label.toLowerCase().includes(search.trim().toLowerCase()));
  return <section aria-label="Lesson filters" className="grid gap-4 rounded-xl border border-[var(--border)] bg-white p-4 sm:grid-cols-2">
    <div className="grid content-start gap-2"><span className="font-semibold">Cluster</span><p>-ing endings</p></div>
    <fieldset className="grid gap-2">
      <legend className="font-semibold">Micro-skill</legend>
      <input aria-label="Search micro-skills" placeholder="Search micro-skills" value={search}
        onChange={event => setSearch(event.target.value)} className="rounded-lg border p-2" />
      <select aria-label="Micro-skill" className="rounded-lg border p-2" value={matches.some(lesson => lesson.key === selected) ? selected : ""}
        onChange={event => router.push(event.target.value ? `?skill=${event.target.value}` : "/admin/teaching-dictionary/lesson-updates")}>
        <option value="">{matches.length ? "Choose a micro-skill" : "No matches"}</option>
        {matches.map(lesson => <option key={lesson.key} value={lesson.key}>{lesson.label}</option>)}
      </select>
    </fieldset>
  </section>;
}
