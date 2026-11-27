"use client";

import { useEffect, useRef, useState } from "react";
import type { LatinRootLessonFamily } from "@/lib/adle/morphology/latin-root-lesson";
import { spellRootOptions, type SpellRootIngredient } from "@/lib/adle/morphology/latin-root-spell-ingredients";
import { deterministicOrderedBuildOrder } from "@/components/adle/activities/shared/ordered-build-engine";
import { DraggableTile } from "@/components/adle/activities/shared/draggable-tile";
import { SpellShout } from "./spell-shout";
import { playInteractionSound } from "@/components/adle/activities/shared/sound";
import { SpellWandStars } from "./spell-wand-stars";
import styles from "./latin-root-lesson.module.css";

import type { LatinRootSpellDraft } from "@/lib/adle/morphology/latin-root-progress";

/** Guided creative play. Full roots keep their spelling; spell endings are fictional. */
export function LatinRootSpellClass({ families, muted, onMutedChange, onContinue, initialDraft, onDraftChange }: { initialDraft?: LatinRootSpellDraft | null; onDraftChange?: (draft: LatinRootSpellDraft) => void; families: LatinRootLessonFamily[]; muted: boolean; onMutedChange: (muted: boolean) => void; onContinue: () => void }) {
  const [phase, setPhase] = useState<"choose" | "match" | "craft" | "cast">(initialDraft?.phase ?? "choose");
  const [familyId, setFamilyId] = useState(initialDraft?.familyId ?? families[0].id);
  const [ending, setEnding] = useState(initialDraft?.ending ?? "o");
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [bonusOpen, setBonusOpen] = useState(initialDraft?.bonusOpen ?? false);
  const [bonusRoot, setBonusRoot] = useState<SpellRootIngredient | null>(() => spellRootOptions(families).find(root => root.root === initialDraft?.bonusRoot) ?? null);
  const [castRun, setCastRun] = useState(0);
  const [message, setMessage] = useState("");
  const draftCallback = useRef(onDraftChange);
  useEffect(() => { draftCallback.current = onDraftChange; }, [onDraftChange]);
  useEffect(() => { draftCallback.current?.({ phase, familyId, ending, bonusOpen, bonusRoot: bonusRoot?.root ?? null }); }, [phase, familyId, ending, bonusOpen, bonusRoot]);
  const rootSlot = useRef<HTMLButtonElement>(null);
  const family = families.find(candidate => candidate.id === familyId)!;
  const roots = deterministicOrderedBuildOrder(spellRootOptions(families), family.id);
  const combinedRoot = family.root + (bonusRoot?.root ?? "");
  const spellName = combinedRoot.charAt(0).toUpperCase() + combinedRoot.slice(1) + ending;
  function castSpell() {
    playInteractionSound("spell_cast", muted);
    setCastRun(previous => previous + 1);
    setPhase("cast");
  }
  function choosePower(id: string) {
    setFamilyId(id); setSelectedRoot(null); setBonusRoot(null); setBonusOpen(false); setMessage(""); setPhase("match");
  }
  function matchRoot(root: string) {
    const ingredient = roots.find(candidate => candidate.root === root);
    if (!ingredient) return;
    if (root !== family.root) { setMessage(`${root} means “${ingredient.meaning.toLowerCase()}”. Find the root that means “${family.meaning.toLowerCase()}”.`); return; }
    setSelectedRoot(null); setMessage(""); setPhase("craft");
  }
  function dropRoot(root: string, point: { x: number; y: number }) {
    const bounds = rootSlot.current?.getBoundingClientRect();
    if (bounds && point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom) matchRoot(root);
  }
  return <SpellWandStars><section className={styles.spellClass} aria-label="Spell Class" data-phase={phase}>
    <div className={styles.spellWorkPanel} data-spell-work-panel>
    <header className={styles.spellHeader}><h1>{"Let's make some of our own spells!"}</h1></header>
    {phase === "choose" ? <div className={styles.powerChooser}>
      <h2>What do you want your spell to do?</h2>
      <div className={styles.powerDefinitions}>{families.map(candidate => <button type="button" key={candidate.id} onClick={() => choosePower(candidate.id)}>{candidate.meaning}</button>)}</div>
    </div> : phase === "match" ? <div className={styles.rootMatching}>
      <h2>Great! Drag the correct root.</h2><p className={styles.chosenDefinition}>{family.meaning}</p>
      <div className={styles.rootIngredientBank} aria-label="Five root options">{roots.map(ingredient => <DraggableTile key={ingredient.root} id={ingredient.root} text={ingredient.root} label={`Choose root ${ingredient.root}`} role="root" recallNeutral muted selected={selectedRoot === ingredient.root} onSelect={setSelectedRoot} onDrop={dropRoot} />)}</div>
      <button type="button" className={styles.rootDropZone} ref={rootSlot} onClick={() => selectedRoot ? matchRoot(selectedRoot) : setMessage("Select a root, then tap this space.")}>Drop your root here</button>
      <p className={styles.spellFeedback} role="status" data-adie-inline="off">{message}</p><button type="button" className="brand-secondary-btn" onClick={() => setPhase("choose")}>Back</button>
    </div> : phase === "craft" ? <div className={styles.spellCraft}>
      <h2>Add a fun ending</h2>
      <div className={styles.simpleSpellPreview} aria-label="Your spell preview"><h3>{spellName}!</h3><p>{family.root}{bonusRoot ? ` + ${bonusRoot.root}` : ""} + {ending}</p></div>
      <div className={styles.endingChoices}>{["o", "os", "is", "um"].map(value => <button type="button" key={value} aria-pressed={ending === value} onClick={() => setEnding(value)}>-{value}</button>)}</div>
      <details className={styles.simpleBonus} open={bonusOpen} onToggle={event => { setBonusOpen(event.currentTarget.open); if (!event.currentTarget.open) setBonusRoot(null); }}><summary>Add a second root (optional)</summary><div className={styles.simpleBonusOptions}><button type="button" className="brand-secondary-btn" aria-pressed={!bonusRoot} onClick={() => setBonusRoot(null)}>Just one root</button>{roots.filter(ingredient => ingredient.root !== family.root).map(ingredient => <button type="button" className="brand-secondary-btn" key={ingredient.root} aria-pressed={bonusRoot?.root === ingredient.root} onClick={() => setBonusRoot(ingredient)}>{ingredient.root} · {ingredient.meaning}</button>)}</div></details>
      <p className={styles.spellFootnote}>These endings are invented for our game.</p>
      <div className={styles.actions}><button type="button" className="brand-secondary-btn" onClick={() => setPhase("choose")}>Back</button><button type="button" className="brand-primary-btn" onClick={castSpell}>Cast my spell</button></div>
    </div> : <SpellShout spellName={spellName} run={castRun} muted={muted} onMutedChange={onMutedChange} onReplay={castSpell} onChange={() => setPhase("craft")} onContinue={onContinue} />}
    </div>
  </section></SpellWandStars>;
}
