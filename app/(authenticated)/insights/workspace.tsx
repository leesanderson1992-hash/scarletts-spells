"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { averageAchievedLevel, familyAverages } from "@/lib/parent-insights/family-average";
import { evidenceStage, proficiencyLevelNumbers, selectedProficiencyLevel, sortedLevelWords } from "@/lib/parent-insights/level-presentation";
import type { InsightFamily, InsightLevel, InsightSkill } from "@/lib/parent-insights/proficiency";

type Snapshot = { date: string; familyKey: string; familyLabel: string; average: number; count: number; policyVersion: string; bandingVersion: string };

function levelState(level: InsightLevel) {
  if (!level.populated) return { icon: "—", label: "No word allocation", className: "is-unallocated" };
  if (level.badge.startsWith("secure")) return { icon: "✓", label: level.limitedAllocation ? "Secured with limited word allocation" : "Secured", className: "is-secure" };
  if (level.badge === "developing") return { icon: "◕", label: "Working toward this level", className: "is-developing" };
  if (level.badge === "developing (early)") return { icon: "◔", label: "Early evidence, gated by a lower level", className: "is-early" };
  return { icon: "○", label: "No credited progress yet", className: "is-not-started" };
}

function nextLevel(skill: InsightSkill) {
  return skill.levels.find((level) => level.level === skill.developingLevel) ?? null;
}

function currentLevelLabel(skill: InsightSkill) {
  return skill.achievedLevel === null ? "Not yet Level 1" : `Level ${skill.achievedLevel}`;
}

export function InsightsWorkspace({ families, skills, snapshots, today, reviewSlot }: {
  families: InsightFamily[];
  skills: InsightSkill[];
  snapshots: Snapshot[];
  today: string;
  reviewSlot: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<{ skillKey: string; levelNumber: number } | null>(null);
  const [collapsedFamilies, setCollapsedFamilies] = useState<string[]>([]);
  const [collapsedClusters, setCollapsedClusters] = useState<string[]>([]);
  const [activeFamily, setActiveFamily] = useState<string | null>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const levelButtons = useRef(new Map<string, HTMLButtonElement>());
  const selected = useMemo(() => selection ? selectedProficiencyLevel(skills, selection.skillKey, selection.levelNumber) : null, [skills, selection]);
  const levelNumbers = proficiencyLevelNumbers(skills);
  const maxLevel = levelNumbers.at(-1) ?? 1;
  const familyAverageByKey = new Map(familyAverages(skills).map((item) => [item.familyKey, item]));
  const clusterAverageByKey = new Map(families.flatMap((family) => family.clusters.map((cluster) =>
    [`${family.key}/${cluster.key}`, averageAchievedLevel(cluster.skills)] as const,
  )));
  const query = search.trim().toLocaleLowerCase();
  const filtered = useMemo(() => families.map((family) => ({
    ...family,
    clusters: family.clusters.map((cluster) => ({
      ...cluster,
      skills: cluster.skills.filter((skill) => !query || `${skill.label} ${cluster.label} ${family.label}`.toLocaleLowerCase().includes(query)),
    })).filter((cluster) => cluster.skills.length),
  })).filter((family) => family.clusters.length), [families, query]);
  useEffect(() => {
    if (!selected) return;
    panelHeadingRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        const button = levelButtons.current.get(`${selected.skill.key}:${selected.level.level}`);
        setSelection(null);
        requestAnimationFrame(() => button?.focus());
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);
  function closePanel() {
    const button = selected ? levelButtons.current.get(`${selected.skill.key}:${selected.level.level}`) : null;
    setSelection(null);
    requestAnimationFrame(() => button?.focus());
  }
  function toggle(list: string[], setter: (value: string[]) => void, key: string) {
    setter(list.includes(key) ? list.filter((item) => item !== key) : [...list, key]);
  }
  const reportableCount = skills.filter((skill) => skill.firstPopulatedLevel !== null).length;
  const securedCount = skills.filter((skill) => skill.achievedLevel !== null).length;
  const buildingCount = skills.filter((skill) => skill.developingLevel !== null).length;

  return <>
    <div className="insights-metrics">
      <div className="insights-metric"><span aria-hidden="true">▦</span><div><strong>{reportableCount}</strong><small>Microskills with level targets</small></div></div>
      <div className="insights-metric"><span aria-hidden="true">✓</span><div><strong>{securedCount}</strong><small>Have achieved a level</small></div></div>
      <div className="insights-metric"><span aria-hidden="true">◕</span><div><strong>{buildingCount}</strong><small>Working toward a level</small></div></div>
    </div>
    <div className="insights-workspace">
      <section className="insights-table-card brand-card" aria-labelledby="insights-microskills-title">
        <div className="insights-card-heading"><div><h2 id="insights-microskills-title">Microskill levels</h2><p>Family → cluster → microskill. Select a level to see its words and progress.</p></div></div>
        <div className="insights-table-tools"><label className="sr-only" htmlFor="insights-search">Search microskills</label><input id="insights-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search microskills" />
          <button type="button" onClick={() => { setCollapsedFamilies([]); setCollapsedClusters([]); }}>Expand all</button>
          <button type="button" onClick={() => { setCollapsedFamilies(families.map((family) => family.key)); setCollapsedClusters([]); }}>Collapse all</button>
        </div>
        <div className="insights-table-scroll"><table className="insights-table"><thead><tr><th scope="col">Microskill</th><th scope="col">Achieved</th>{levelNumbers.map((level) => <th scope="col" key={level}>L{level}</th>)}<th scope="col">Next level</th></tr></thead>
          <tbody>{filtered.map((family) => <FamilyRows key={family.key} family={family} selected={selection} levelNumbers={levelNumbers} familyAverage={familyAverageByKey.get(family.key) ?? null} clusterAverageByKey={clusterAverageByKey} collapsedFamilies={collapsedFamilies} collapsedClusters={collapsedClusters} onToggleFamily={() => toggle(collapsedFamilies, setCollapsedFamilies, family.key)} onToggleCluster={(key) => toggle(collapsedClusters, setCollapsedClusters, key)} onSelect={setSelection} levelButtons={levelButtons} />)}</tbody></table>
          {!filtered.length ? <div className="insights-empty">{skills.length ? "No microskills match your search." : "No ADLE microskill levels are available yet."}</div> : null}
        </div>
      </section>
      <div className="insights-right-stack">
        <FamilyChart skills={skills} snapshots={snapshots} today={today} maxLevel={maxLevel} activeFamily={activeFamily} setActiveFamily={setActiveFamily} />
        {reviewSlot}
        {selected ? <aside className="insights-detail-panel brand-card" aria-labelledby="insights-detail-title">
          <div className="insights-detail-header"><div><p className="brand-eyebrow">Level {selected.level.level} evidence</p><h2 id="insights-detail-title" ref={panelHeadingRef} tabIndex={-1}>{selected.skill.label}</h2><p>{selected.skill.familyLabel} / {selected.skill.clusterLabel}</p></div><button type="button" className="insights-close" aria-label="Close microskill details" onClick={closePanel}>×</button></div>
          <div className="insights-achievement"><div><small>Selected level</small><strong>Level {selected.level.level} · {selected.level.badge === "not started" ? "Unstarted" : selected.level.badge.startsWith("secure") ? "Secured" : "Developing"}</strong></div><div><small>Achieved level</small><strong>{currentLevelLabel(selected.skill)}</strong></div></div>
          <SelectedLevelCard level={selected.level} />
          {selected.skill.developingLevel !== null && selected.skill.developingLevel < selected.level.level ? <p className="insights-panel-note">Level {selected.skill.developingLevel} must be secured before Level {selected.level.level} can be achieved.</p> : null}
          <h3>Level {selected.level.level} words · {selected.level.allocation} allocated</h3><p className="insights-panel-note">{selected.level.words.length} eligible for this child&apos;s proficiency evidence.</p><div className="insights-evidence-words">{sortedLevelWords(selected.level).map((word) => <div key={word.id} className={word.credit === 0 ? "is-unseen" : ""}><strong>{word.word}</strong><span>{evidenceStage(word.state)}{word.state === "review_retired" ? " (review retired)" : ""}</span><small>{word.credit.toFixed(1)} credit{word.credit === 0 ? " · Not yet contributing" : ""}</small></div>)}{selected.level.words.length === 0 ? <p>No eligible words are available at this level yet.</p> : null}</div>
          <div className="insights-credit-key"><h3>How word evidence counts</h3><p>Unseen 0 · Active 0.1 · Produced 0.4 · Secure, retired or mastered 1.0 credit per word.</p><p>Higher-level evidence may appear early; a populated lower level must be secured first.</p></div>
        </aside> : null}
      </div>
    </div>
  </>;
}

function FamilyRows({ family, selected, levelNumbers, familyAverage, clusterAverageByKey, collapsedFamilies, collapsedClusters, onToggleFamily, onToggleCluster, onSelect, levelButtons }: {
  family: InsightFamily; selected: { skillKey: string; levelNumber: number } | null; levelNumbers: number[];
  familyAverage: ReturnType<typeof averageAchievedLevel>; clusterAverageByKey: Map<string, ReturnType<typeof averageAchievedLevel>>;
  collapsedFamilies: string[]; collapsedClusters: string[];
  onToggleFamily: () => void; onToggleCluster: (key: string) => void; onSelect: (selection: { skillKey: string; levelNumber: number }) => void;
  levelButtons: React.RefObject<Map<string, HTMLButtonElement>>;
}) {
  const familyClosed = collapsedFamilies.includes(family.key);
  return <><tr className="insights-family-row"><th scope="rowgroup" colSpan={levelNumbers.length + 3}><button type="button" aria-expanded={!familyClosed} onClick={onToggleFamily}><span aria-hidden="true">{familyClosed ? "›" : "⌄"}</span>{family.label}<small>{familyAverage ? `Average level ${familyAverage.average.toFixed(2)} / ${levelNumbers.at(-1)} · ${familyAverage.count} with targets` : "No level targets"}</small></button></th></tr>
    {!familyClosed && family.clusters.map((cluster) => { const clusterKey = `${family.key}/${cluster.key}`; const clusterClosed = collapsedClusters.includes(clusterKey); return <FragmentRows key={clusterKey} cluster={cluster} clusterClosed={clusterClosed} levelNumbers={levelNumbers} average={clusterAverageByKey.get(clusterKey) ?? null} onToggle={() => onToggleCluster(clusterKey)} selected={selected} onSelect={onSelect} levelButtons={levelButtons} />; })}</>;
}

function FragmentRows({ cluster, clusterClosed, levelNumbers, average, onToggle, selected, onSelect, levelButtons }: {
  cluster: InsightFamily["clusters"][number]; clusterClosed: boolean; onToggle: () => void;
  levelNumbers: number[]; average: ReturnType<typeof averageAchievedLevel>;
  selected: { skillKey: string; levelNumber: number } | null;
  onSelect: (selection: { skillKey: string; levelNumber: number }) => void; levelButtons: React.RefObject<Map<string, HTMLButtonElement>>;
}) {
  return <><tr className="insights-cluster-row"><th scope="rowgroup" colSpan={levelNumbers.length + 3}><button type="button" aria-expanded={!clusterClosed} onClick={onToggle}><span aria-hidden="true">{clusterClosed ? "›" : "⌄"}</span>{cluster.label}<small>{average ? `Average level ${average.average.toFixed(2)} / ${levelNumbers.at(-1)} · ${average.count} with targets` : "No level targets"}</small></button></th></tr>
    {!clusterClosed && cluster.skills.map((skill) => { const next = nextLevel(skill); return <tr key={skill.key} className={selected?.skillKey === skill.key ? "is-selected" : ""}>
      <th scope="row">{skill.label}</th><td><span className="insights-achieved-badge">{skill.achievedLevel === null ? "—" : `L${skill.achievedLevel}`}<span className="sr-only">{currentLevelLabel(skill)}</span></span></td>
      {levelNumbers.map((number) => { const level = skill.levels.find((item) => item.level === number); const state = level ? levelState(level) : null; return <td key={number}>{level?.populated && state ? <button ref={(node) => { const key = `${skill.key}:${number}`; if (node) levelButtons.current.set(key, node); else levelButtons.current.delete(key); }} type="button" className="insights-level-button" aria-label={`${skill.label}, Level ${number}: ${state.label}. Show allocated words`} aria-expanded={selected?.skillKey === skill.key && selected.levelNumber === number} title={`Level ${number}: ${state.label}`} onClick={() => onSelect({ skillKey: skill.key, levelNumber: number })}><span className={`insights-level-icon ${state.className}`} aria-hidden="true">{state.icon}</span></button> : <span className="insights-muted" aria-label={`Level ${number}: No word allocation`}>—</span>}</td>; })}
      <td>{next ? <div className="insights-row-progress"><span>To L{next.level}</span><progress max={1} value={next.progress ?? 0} aria-label={`${skill.label}: ${Math.round((next.progress ?? 0) * 100)} percent toward Level ${next.level}`} /><small>{Math.round((next.progress ?? 0) * 100)}%</small></div> : <span className="insights-muted">—</span>}</td>
    </tr>; })}</>;
}

function SelectedLevelCard({ level }: { level: InsightLevel }) {
  const remaining = Math.max(0, (level.target ?? 0) - level.credit);
  return <div className="insights-next-card"><div className="insights-next-stats"><div><small>Target</small><strong>{level.target ?? "—"}</strong><span>breadth credits</span></div><div><small>Credited</small><strong>{level.credit.toFixed(1)}</strong><span>from eligible words</span></div><div><small>Remaining</small><strong>{remaining.toFixed(1)}</strong><span>credits</span></div></div><progress max={1} value={level.progress ?? 0} aria-label={`${Math.round((level.progress ?? 0) * 100)} percent toward Level ${level.level}`} /><p>{Math.round((level.progress ?? 0) * 100)}% toward Level {level.level}{level.limitedAllocation ? " · limited word allocation" : ""}</p></div>;
}

function FamilyChart({ skills, snapshots, today, maxLevel, activeFamily, setActiveFamily }: {
  skills: InsightSkill[]; snapshots: Snapshot[]; today: string; maxLevel: number; activeFamily: string | null; setActiveFamily: (key: string | null) => void;
}) {
  const colors = ["#f52b91", "#8158dc", "#29a4c5", "#e39b46", "#558b67", "#b57bc7"];
  const current = new Map(familyAverages(skills).map((average) => [average.familyKey, average]));
  const since = new Date(`${today}T12:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 56);
  const dates = [...new Set([...snapshots.filter((row) => row.date >= since.toISOString().slice(0, 10)).map((row) => row.date), today])].sort();
  const familyKeys = [...current.keys()].sort();
  const series = familyKeys.map((key, index) => {
    const entry = current.get(key)!;
    const history = snapshots.filter((row) => row.familyKey === key && row.date >= since.toISOString().slice(0, 10) && row.policyVersion === entry.policyVersion && row.bandingVersion === entry.bandingVersion);
    const points = history.filter((row) => row.date !== today).map((row) => ({ date: row.date, average: row.average, count: row.count }));
    points.push({ date: today, average: entry.average, count: entry.count });
    return { key, label: entry.familyLabel, color: colors[index % colors.length], points: points.sort((a, b) => a.date.localeCompare(b.date)) };
  });
  const x = (date: string) => 34 + (dates.indexOf(date) / Math.max(1, dates.length - 1)) * 316;
  const y = (value: number) => 174 - (value / maxLevel) * 150;
  const active = series.find((line) => line.key === activeFamily) ?? null;
  const latest = active?.points.at(-1);
  return <section className="insights-chart-card brand-card" aria-labelledby="family-chart-title"><div className="insights-card-heading"><div><h2 id="family-chart-title">Average family level over time</h2><p>Average achieved microskill level, 0–{maxLevel}</p></div></div>
    {series.length ? <><div className="insights-chart-wrap"><svg viewBox="0 0 370 205" role="img" aria-label="Line graph of average attained level by skill family">
      {Array.from({ length: maxLevel + 1 }, (_, level) => <g key={level}><line x1="34" x2="350" y1={y(level)} y2={y(level)} stroke="#ede8f0" /><text x="13" y={y(level) + 4} fontSize="10" fill="#657086">{level}</text></g>)}
      {series.map((line) => { const segments = line.points.map((point) => `${x(point.date)},${y(point.average)}`).join(" "); return <g key={line.key} opacity={activeFamily && activeFamily !== line.key ? .35 : 1}><polyline points={segments} fill="none" stroke={line.color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /><polyline points={segments} fill="none" stroke="transparent" strokeWidth="18" onMouseEnter={() => setActiveFamily(line.key)} onMouseLeave={() => setActiveFamily(null)}><title>{line.label}</title></polyline>{line.points.map((point) => <circle key={point.date} cx={x(point.date)} cy={y(point.average)} r="4" fill={line.color} tabIndex={0} role="img" aria-label={`${line.label}, ${point.date}: average level ${point.average.toFixed(2)} across ${point.count} microskills`} onFocus={() => setActiveFamily(line.key)} onBlur={() => setActiveFamily(null)} onMouseEnter={() => setActiveFamily(line.key)} />)}</g>; })}
      <text x="34" y="199" fontSize="10" fill="#657086">{dates[0]}</text><text x="277" y="199" fontSize="10" fill="#657086">{today}</text>
    </svg>{active && latest ? <div className="insights-chart-tooltip" role="status"><strong>{active.label}</strong><span>Average {latest.average.toFixed(2)} · {latest.count} microskills</span></div> : null}</div>
      <div className="insights-chart-legend">{series.map((line) => <button key={line.key} type="button" onFocus={() => setActiveFamily(line.key)} onBlur={() => setActiveFamily(null)} onMouseEnter={() => setActiveFamily(line.key)} onMouseLeave={() => setActiveFamily(null)}><i style={{ background: line.color }} />{line.label}</button>)}</div>
      {dates.length < 2 ? <p className="insights-chart-note">History starts with the first recorded snapshot. Today&apos;s average is shown now.</p> : null}
    </> : <p className="insights-empty">Family level trends will appear when ADLE microskills have populated level targets.</p>}
  </section>;
}
