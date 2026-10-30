"use client";

import { Fragment, useMemo, useState } from "react";
import type { ParentV2Dashboard } from "@/lib/parent-insights/proficiency-v2";

type Skill = Pick<ParentV2Dashboard["skills"][number], "key" | "label" | "familyKey" | "familyLabel" | "clusterKey" | "clusterLabel" | "evidenceWords"> & {
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
  const [selection, setSelection] = useState<{ key: string; level: number } | null>(null);
  const [closedFamilies, setClosedFamilies] = useState<string[]>([]);
  const [closedClusters, setClosedClusters] = useState<string[]>([]);
  const [wordSearch, setWordSearch] = useState("");
  const [wordFilter, setWordFilter] = useState("all");
  const shownSkills = useMemo(() => skills.filter((skill) =>
    `${skill.label} ${skill.familyLabel} ${skill.clusterLabel}`.toLowerCase().includes(skillSearch.toLowerCase().trim())), [skills, skillSearch]);
  const families = useMemo(() => {
    const grouped = new Map<string, { key: string; label: string; clusters: Map<string, { key: string; label: string; skills: Skill[] }> }>();
    for (const skill of shownSkills) {
      const family = grouped.get(skill.familyKey) ?? { key: skill.familyKey, label: skill.familyLabel, clusters: new Map() };
      const cluster = family.clusters.get(skill.clusterKey) ?? { key: skill.clusterKey, label: skill.clusterLabel, skills: [] };
      cluster.skills.push(skill);
      family.clusters.set(skill.clusterKey, cluster);
      grouped.set(skill.familyKey, family);
    }
    return [...grouped.values()].map((family) => ({ ...family, clusters: [...family.clusters.values()]
      .sort((a, b) => a.label.localeCompare(b.label)) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [shownSkills]);
  const selectedSkill = skills.find((skill) => skill.key === selection?.key);
  const selectedLevel = selectedSkill?.result.levels.find((level) => level.level === selection?.level);
  const selectedGroupNames = new Map([...new Set(selectedSkill?.evidenceWords.map((word) => word.groupKey) ?? [])]
    .sort().map((key, index) => [key, key.startsWith("role:") ? `${key.slice(5)} meaning` :
      key.startsWith("unresolved:") ? "Family unresolved" : `Word family ${index + 1}`]));
  const shownWords = useMemo(() => words.filter((word) =>
    word.word.toLowerCase().includes(wordSearch.toLowerCase().trim()) &&
    (wordFilter === "all" || word.state === wordFilter || wordFilter === "slipped" && word.slipped)), [words, wordSearch, wordFilter]);
  const toggle = (items: string[], setItems: (items: string[]) => void, key: string) =>
    setItems(items.includes(key) ? items.filter((item) => item !== key) : [...items, key]);
  return <div className="space-y-6">
    <div className="insights-metrics">
      <div className="insights-metric"><span aria-hidden="true">▦</span><div><strong>{skills.length}</strong><small>Active micro-skills</small></div></div>
      <div className="insights-metric"><span aria-hidden="true">✓</span><div><strong>{skills.filter((skill) => skill.result.level !== null).length}</strong><small>Have achieved a level</small></div></div>
      <div className="insights-metric"><span aria-hidden="true">◕</span><div><strong>{skills.filter((skill) => skill.result.level !== 5 && skill.evidenceWords.length > 0).length}</strong><small>With qualifying word evidence</small></div></div>
    </div>
    <div className="insights-workspace">
      <section className="insights-table-card brand-card" aria-labelledby="skill-proficiency-heading">
        <div className="insights-card-heading"><div><h2 id="skill-proficiency-heading">Micro-skill proficiency</h2>
          <p>Family → cluster → micro-skill. Select L1–L5 to see its requirements and contributing words.</p></div></div>
        <div className="insights-table-tools"><label className="sr-only" htmlFor="v2-skill-search">Search micro-skills</label>
          <input id="v2-skill-search" type="search" placeholder="Search micro-skills" value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} />
          <button type="button" onClick={() => { setClosedFamilies([]); setClosedClusters([]); }}>Expand all</button>
          <button type="button" onClick={() => { setClosedFamilies(families.map((family) => family.key)); setClosedClusters([]); }}>Collapse all</button></div>
        <div className="insights-table-scroll"><table className="insights-table"><thead><tr><th scope="col">Micro-skill</th><th scope="col">Achieved</th>
          {[1, 2, 3, 4, 5].map((level) => <th scope="col" key={level}>L{level}</th>)}<th scope="col">Next level</th></tr></thead>
          <tbody>{families.map((family) => {
            const familyClosed = closedFamilies.includes(family.key);
            return <Fragment key={family.key}>
              <tr className="insights-family-row"><th scope="rowgroup" colSpan={8}><button type="button" aria-expanded={!familyClosed}
                onClick={() => toggle(closedFamilies, setClosedFamilies, family.key)}><span aria-hidden="true">{familyClosed ? "›" : "⌄"}</span>{family.label}
                <small>{family.clusters.reduce((total, cluster) => total + cluster.skills.length, 0)} micro-skills</small></button></th></tr>
              {!familyClosed && family.clusters.map((cluster) => {
                const clusterId = `${family.key}/${cluster.key}`;
                const clusterClosed = closedClusters.includes(clusterId);
                return <Fragment key={clusterId}>
                  <tr className="insights-cluster-row"><th scope="rowgroup" colSpan={8}><button type="button" aria-expanded={!clusterClosed}
                    onClick={() => toggle(closedClusters, setClosedClusters, clusterId)}><span aria-hidden="true">{clusterClosed ? "›" : "⌄"}</span>{cluster.label}
                    <small>{cluster.skills.length} micro-skills</small></button></th></tr>
                  {!clusterClosed && cluster.skills.map((skill) => {
                    const next = skill.result.levels.find((row) => !row.passed);
                    return <tr key={skill.key} className={selection?.key === skill.key ? "is-selected" : ""}>
                      <th scope="row" title={skill.label}>{skill.label}</th>
                      <td>{skill.result.level ? <span className="insights-achieved-badge">{skill.result.level}</span> :
                        <span className="insights-muted" title={skill.result.status === "ready_to_discover" ? "Ready to discover" : "Insufficient evidence"}>—</span>}</td>
                      {skill.result.levels.map((row) => {
                        const achieved = row.passed && row.level <= (skill.result.level ?? 0);
                        const active = selection?.key === skill.key && selection.level === row.level;
                        return <td key={row.level}><button type="button" className="insights-level-button" aria-expanded={active}
                          aria-label={`${skill.label}, Level ${row.level}: ${achieved ? "achieved" : "not yet achieved"}`}
                          onClick={() => setSelection(active ? null : { key: skill.key, level: row.level })}>
                          <span className={`insights-level-icon ${achieved ? "is-secure" : next?.level === row.level ? "is-developing" : "is-not-started"}`}
                            aria-hidden="true">{achieved ? "✓" : next?.level === row.level ? "◕" : "○"}</span></button></td>;
                      })}
                      <td className="insights-v2-next">{next ? `L${next.level} · ${next.gates.filter((gate) => gate.passed).length}/4 gates` : "All levels met"}</td>
                    </tr>;
                  })}
                </Fragment>;
              })}
            </Fragment>;
          })}</tbody></table>{families.length === 0 ? <div className="insights-empty">No micro-skills match your search.</div> : null}</div>
      </section>
      <div className="insights-right-stack">
        {selectedSkill && selectedLevel ? <aside className="insights-detail-panel insights-v2-detail brand-card" aria-labelledby="v2-detail-title">
          <div className="insights-detail-header"><div><p className="brand-eyebrow">Level {selectedLevel.level} evidence</p>
            <h2 id="v2-detail-title">{selectedSkill.label}</h2><p>{selectedSkill.familyLabel} / {selectedSkill.clusterLabel}</p></div>
            <button type="button" className="insights-close" aria-label="Close micro-skill details" onClick={() => setSelection(null)}>×</button></div>
          <div className="insights-achievement"><div><small>Selected level</small><strong>{selectedLevel.passed ? "Achieved" :
            selectedSkill.result.setbackHeld && selectedLevel.level <= (selectedSkill.result.level ?? 0) ? "Held after a recent slip" : "Not yet achieved"}</strong></div>
            <div><small>Current proficiency</small><strong>{selectedSkill.result.level ? `Level ${selectedSkill.result.level}/5` :
              selectedSkill.result.status === "ready_to_discover" ? "Ready to discover" : "Insufficient evidence"}</strong></div></div>
          <p className="insights-panel-note">{trendLabel[selectedSkill.result.trend]} trend · {selectedSkill.result.confidence} evidence confidence</p>
          {selectedSkill.result.recentSetback ? <p className="insights-v2-alert">Recent contextual slip: {selectedSkill.result.setbackHeld ?
            "the displayed level is held while accuracy is rebuilt." : "the slip is reflected in accuracy."}</p> : null}
          <h3>Level {selectedLevel.level} requirements</h3>
          <div className="insights-detail-levels">{selectedLevel.gates.map((gate) => <div key={gate.dimension}>
            <span className={`insights-level-icon ${gate.passed ? "is-secure" : "is-not-started"}`} aria-hidden="true">{gate.passed ? "✓" : "○"}</span>
            <strong className="capitalize">{gate.dimension}</strong><small>{gate.observed}/{gate.required}{gate.passed ? " met" : " needed"}<span>{gate.detail}</span></small>
          </div>)}</div>
          {!selectedLevel.passed && selectedLevel.gates.every((gate) => gate.passed) ? <p className="insights-panel-note">A lower level must be achieved first.</p> : null}
          {selectedLevel.contentLimited || selectedSkill.result.status === "unresolved" ? <p className="insights-v2-alert">Available content or evidence authority limits this result. This is not a learner failure.</p> : null}
          <p className="insights-panel-note"><strong>Next step:</strong> {selectedSkill.result.nextRequirement}</p>
          <h3>Words with qualifying V2 evidence · {selectedSkill.evidenceWords.length}</h3>
          <p className="insights-panel-note">The same evidence can support several levels. Words are not assigned to one level; related words share one breadth group.</p>
          <div className="insights-evidence-words">{selectedSkill.evidenceWords.map((word) => <div key={word.id}>
            <strong>{word.word}</strong><span>{selectedGroupNames.get(word.groupKey)}</span>
            <small>{word.attempts} qualifying {word.attempts === 1 ? "attempt" : "attempts"} on {word.dates} {word.dates === 1 ? "date" : "dates"}</small>
            <small>{word.transfer ? "Relevant transfer shown" : word.independent ? "Independent retrieval shown" : "Controlled application shown"}</small>
          </div>)}{selectedSkill.evidenceWords.length === 0 ? <p>No qualifying word evidence yet.</p> : null}</div>
          <div className="insights-credit-key"><h3>How V2 counts words</h3><p>Qualified correct spelling can support every approved applicable skill. A misspelt word is unscored. Cover-check is word mastery only. Breadth counts each base family or contextual role once.</p></div>
        </aside> : <section className="insights-v2-prompt brand-card"><h2>Select a level</h2><p>Choose L1–L5 beside a micro-skill to see its gates and the words behind its evidence.</p></section>}
        {reviewSlot}
      </div>
    </div>
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
