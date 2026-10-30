"use client";

import { useMemo, useState } from "react";
import type { ParentV2Dashboard } from "@/lib/parent-insights/proficiency-v2";

type Skill = Pick<ParentV2Dashboard["skills"][number], "key" | "label" | "familyLabel"> & {
  result: Pick<ParentV2Dashboard["skills"][number]["result"], "level" | "status" | "trend" | "confidence" | "nextRequirement" | "levels" | "observed" | "recentSetback" | "setbackHeld">;
};
type Word = ParentV2Dashboard["words"][number];

const stateLabel: Record<string, string> = {
  unseen: "Not yet practised", active: "In practice", produced: "Produced independently",
  secure: "Secure", review_retired: "Exited Review", mastered: "Mastered",
};
const trendLabel: Record<string, string> = {
  improving: "Improving", steady: "Steady", needs_practice: "Needs practice", insufficient_history: "Not enough history",
};

export function V2InsightsWorkspace({ skills, words, reviewSlot }: {
  skills: Skill[]; words: Word[]; reviewSlot: React.ReactNode;
}) {
  const [skillSearch, setSkillSearch] = useState("");
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [wordSearch, setWordSearch] = useState("");
  const [wordFilter, setWordFilter] = useState("all");
  const shownSkills = useMemo(() => skills.filter((skill) =>
    `${skill.label} ${skill.familyLabel}`.toLowerCase().includes(skillSearch.toLowerCase().trim())), [skills, skillSearch]);
  const shownWords = useMemo(() => words.filter((word) =>
    word.word.toLowerCase().includes(wordSearch.toLowerCase().trim()) &&
    (wordFilter === "all" || word.state === wordFilter || wordFilter === "slipped" && word.slipped)), [words, wordSearch, wordFilter]);
  return <div className="space-y-6">
    <section className="brand-card p-6" aria-labelledby="skill-proficiency-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 id="skill-proficiency-heading" className="text-xl font-semibold">Micro-skill proficiency</h2>
          <p className="brand-copy mt-1">How reliably a spelling pattern is applied across words and contexts. Levels use accuracy, breadth, retention and relevant challenge.</p></div>
        <label className="text-sm">Find a micro-skill <input className="mt-1 block rounded border p-2" value={skillSearch}
          onChange={(event) => setSkillSearch(event.target.value)} type="search" /></label>
      </div>
      <p className="brand-copy mt-3">{shownSkills.length} of {skills.length} active micro-skills. Limited confidence means the evidence or its mapping needs more checking.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{shownSkills.slice(0, showAllSkills || skillSearch ? undefined : 40).map((skill) => {
        const next = skill.result.levels.find((row) => !row.passed);
        return <details key={skill.key} className="rounded-lg border p-4">
          <summary className="cursor-pointer"><span className="text-xs text-slate-600">{skill.familyLabel}</span><br />
            <strong>{skill.label}</strong><span className="ml-2 font-semibold">{skill.result.level ? `Level ${skill.result.level}/5` :
              skill.result.status === "ready_to_discover" ? "Ready to discover" : "Insufficient evidence"}</span></summary>
          <div className="mt-3 text-sm">
            <p><strong>Trend:</strong> {trendLabel[skill.result.trend]} · <strong>Evidence confidence:</strong> {skill.result.confidence}</p>
            {skill.result.recentSetback ? <p className="mt-2 text-amber-800">Recent contextual slip: {skill.result.setbackHeld
              ? "the displayed level is held while accuracy is rebuilt." : "the slip is reflected in the current accuracy."}</p> : null}
            <p className="mt-2"><strong>Next step:</strong> {skill.result.nextRequirement}</p>
            {next ? <><p className="mt-2">{skill.result.setbackHeld ? "Current gate observations" : `Level ${next.level} requirements`}</p>
              <ul className="mt-2 list-disc pl-5">{next.gates.map((gate) => <li key={gate.dimension}>
              {gate.dimension}: {gate.observed}/{gate.required}{gate.passed ? " met" : " needed"}
            </li>)}</ul></> : <p className="mt-2">All five level gates are met.</p>}
            {skill.result.status === "content_limited" || skill.result.status === "unresolved" ?
              <p className="mt-2 text-amber-800">Available content or evidence authority limits this result; it does not indicate a failed learner.</p> : null}
          </div>
        </details>;
      })}</div>
      {!showAllSkills && !skillSearch && shownSkills.length > 40 ? <button className="brand-secondary-btn mt-4" type="button"
        onClick={() => setShowAllSkills(true)}>Show all {shownSkills.length} micro-skills</button> : null}
    </section>
    <section className="brand-card p-6" aria-labelledby="word-mastery-heading">
      <h2 id="word-mastery-heading" className="text-xl font-semibold">Word mastery</h2>
      <p className="brand-copy mt-1">Progress for individual studied words. “Exited Review” is a Review milestone; “Mastered” requires separate evidence.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="text-sm">Find a word <input className="mt-1 block rounded border p-2" value={wordSearch}
          onChange={(event) => setWordSearch(event.target.value)} type="search" /></label>
        <label className="text-sm">State <select className="mt-1 block rounded border p-2" value={wordFilter}
          onChange={(event) => setWordFilter(event.target.value)}>
          <option value="all">All studied words</option><option value="active">In practice</option>
          <option value="produced">Produced</option><option value="secure">Secure</option>
          <option value="review_retired">Exited Review</option><option value="mastered">Mastered</option>
          <option value="slipped">Unresolved slip</option>
        </select></label>
      </div>
      <p className="brand-copy mt-3">{shownWords.length} of {words.length} studied words{shownWords.length > 100 ? "; first 100 shown" : ""}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">{shownWords.slice(0, 100).map((word) => <article key={word.id} className="rounded-lg border p-3 text-sm">
        <div className="flex justify-between gap-2"><strong>{word.word}</strong><span>{stateLabel[word.state] ?? word.state}</span></div>
        <p className="mt-1">{word.productions} valid productions on {word.distinctDays} dates · {word.verifiedAuthenticUses} verified authentic uses</p>
        <p>Review: {word.reviewStatus} · {word.nextReview}</p>
        {word.slipped ? <p className="font-medium text-amber-800">Unresolved slip: practise and show a later correct use</p> : null}
      </article>)}</div>
      {words.length === 0 ? <p className="brand-copy mt-3">No studied words yet.</p> : null}
    </section>
    {reviewSlot}
  </div>;
}
