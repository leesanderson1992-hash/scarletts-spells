"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import type { LatinRootLessonFamily } from "@/lib/adle/morphology/latin-root-lesson";
import { latinRootTreeBuildModel } from "@/lib/adle/morphology/latin-root-tree-build";
import { orderedBuildTargetIsCorrect, useOrderedBuildEngine, type OrderedBuildSnapshot } from "@/components/adle/activities/shared/ordered-build-engine";
import { DraggableTile } from "@/components/adle/activities/shared/draggable-tile";
import { HearWordButton } from "@/components/adle/activities/shared/authored-audio";
import styles from "./latin-root-lesson.module.css";

// The boxes sit just above the six existing branches in the illustration.
const slots = [{ x: 24, y: 20 }, { x: 76, y: 20 }, { x: 24, y: 42 }, { x: 76, y: 42 }, { x: 24, y: 64 }, { x: 76, y: 64 }];
type Feedback = { wordId: string; correct: boolean; parts: { text: string; meaning: string }[] };
export function LatinRootFamilyTree({ family, familyIndex, familyCount, initialSnapshot, onProgress, onNext, onBack, muted }: {
  family: LatinRootLessonFamily; familyIndex: number; familyCount: number;
  initialSnapshot?: OrderedBuildSnapshot; muted?: boolean;
  onProgress: (snapshot: OrderedBuildSnapshot) => void;
  onNext: () => void; onBack?: () => void;
}) {
  const model = useMemo(() => latinRootTreeBuildModel(family), [family]);
  const engine = useOrderedBuildEngine({ targets: model.targets, pieceIds: model.pieces.map(piece => piece.id), initialSnapshot, onProgress });
  const [activeId, setActiveId] = useState(family.words[0].id);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const slotRefs = useRef(new Map<string, { wordId: string; slot: number; node: HTMLButtonElement }>());
  const activeWord = family.words.find(word => word.id === activeId)!;
  const completed = engine.snapshot.completedTargetIds;
  const placed = engine.snapshot.placements[activeId];
  // One visible bank tile per equivalent part; remaining copies support reuse.
  const available = model.pieces.filter(piece => engine.availablePieceIds.includes(piece.id));
  const bank = available.filter((piece, index) => available.findIndex(other => other.text === piece.text && other.role === piece.role && other.meaning === piece.meaning) === index);
  const selected = model.pieces.find(piece => piece.id === engine.selectedPieceId);
  function place(pieceId: string, wordId: string, slot: number) {
    if (completed.includes(wordId) || !engine.availablePieceIds.includes(pieceId)) return;
    engine.placePiece(pieceId, wordId, slot); setActiveId(wordId); setFeedback(null);
    const next = engine.snapshot.placements[wordId].map((value, index) => index === slot ? pieceId : value);
    if (next.every(Boolean)) check(wordId, next);
    else setAnnouncement("Part placed. Fill the remaining spaces to build your word.");
  }
  function pointerDrop(pieceId: string, point: { x: number; y: number }) {
    for (const { wordId, slot, node } of slotRefs.current.values()) {
      if (completed.includes(wordId)) continue;
      const rect = node.getBoundingClientRect();
      if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) { place(pieceId, wordId, slot); return; }
    }
  }
  function check(wordId: string, placements: Array<string | null>) {
    const word = family.words.find(candidate => candidate.id === wordId)!;
    const correct = orderedBuildTargetIsCorrect(model.targets.find(target => target.id === wordId)!, placements);
    let nextSlot = 0;
    const parts = word.parts.map(part => {
      if (part.role === "root") return part;
      const pieceId = placements[nextSlot++];
      return model.pieces.find(piece => piece.id === pieceId)!;
    });
    setFeedback({ wordId, correct, parts });
    if (correct) engine.completeTarget(wordId);
    setAnnouncement(correct ? "Correct. Read what each part means." : "Not quite. Read what your chosen parts mean, then try again.");
  }
  function explore(wordId: string) {
    setActiveId(wordId);
    setFeedback(completed.includes(wordId) ? { wordId, correct: true, parts: family.words.find(word => word.id === wordId)!.parts } : null);
  }
  return <section className={styles.familyPage} aria-label={`${family.root} word family`}>
    <div className={styles.familyHeading}><h2>Build the {family.root.toUpperCase()} family</h2><p>Family {familyIndex + 1} of {familyCount} · {completed.length} of {family.words.length} words built</p></div>
    <div className={styles.treeWorkspace}>
      <aside className={styles.builderPanel} aria-label="Word builder">
        <h3>Word-part bank</h3><p>Drag a part to a branch space, or select a part and tap its space. Match the branch’s meaning.</p>
        <div className={styles.partBank} aria-label="Available word parts">{bank.map(piece => <DraggableTile key={piece.id} id={piece.id} text={piece.text} label={`Select ${piece.text}`} role={piece.role} selected={selected?.text === piece.text && selected?.role === piece.role} recallNeutral muted onSelect={id => { engine.selectPiece(id); setAnnouncement("Now choose a space on the branch with the matching meaning."); }} onDrop={pointerDrop} />)}</div>
        <div className={styles.activeBranch}><strong>Branch {family.words.indexOf(activeWord) + 1}</strong><p>{activeWord.meaning}</p>{!completed.includes(activeId) && placed.some(Boolean) && <button type="button" className="brand-secondary-btn" onClick={() => { engine.resetTarget(activeId); setFeedback(null); }}>Clear branch</button>}</div>
        <div className={styles.partFeedback} role="status" data-adie-inline="off">
          {feedback ? <><strong>{feedback.correct ? "Correct!" : "Not quite — look at the parts."}</strong><dl>{feedback.parts.map((part, index) => <div key={index}><dt>{part.text}</dt><dd>{part.meaning}</dd></div>)}</dl>{feedback.correct && <HearWordButton muted={muted} word={family.words.find(word => word.id === feedback.wordId)!.word} label="Hear word" />}</> : <p>Fill a branch’s spaces to reveal the meaning of each part.</p>}
        </div>
        <p className="sr-only" aria-live="polite">{announcement}</p>
      </aside>
      <div className={styles.tree}>
        <Image src="/adle/latin-roots/magical-tree-branches.webp" alt="" fill sizes="(max-width: 760px) 100vw, 900px" className={styles.treeArt} priority />
        <ol className={styles.wordPositions}>
          {family.words.map((word, index) => {
            const done = completed.includes(word.id);
            let partSlot = 0;
            return <li key={word.id} className={styles.branchBox} data-branch={index + 1} data-completed={done} data-active={activeId === word.id} style={{ left: `${slots[index].x}%`, top: `${slots[index].y}%` }}>
              <p className={styles.branchMeaning}>{word.meaning}</p>
              {done ? <button type="button" className={styles.builtWord} aria-label={`Explore ${word.word}`} onClick={() => explore(word.id)}>{word.word}<span aria-hidden="true"> ✓</span></button> : <div className={styles.branchParts} aria-label={`Branch ${index + 1} word box`}>
                {word.parts.map((part, partIndex) => {
                  if (part.role === "root") return <span key={partIndex} className={styles.fixedRoot}>{family.root}</span>;
                  const slot = partSlot++;
                  const pieceId = engine.snapshot.placements[word.id][slot];
                  const piece = model.pieces.find(candidate => candidate.id === pieceId);
                  return <button key={partIndex} type="button" className={styles.branchSlot} data-slot={`${index + 1}:${slot}`} ref={node => { const key = `${word.id}:${slot}`; if (node) slotRefs.current.set(key, { wordId: word.id, slot, node }); else slotRefs.current.delete(key); }} aria-label={`Branch ${index + 1} ${part.role} space ${slot + 1}${piece ? `: ${piece.text}` : ""}`} onClick={() => {
                    setActiveId(word.id); setFeedback(null);
                    if (engine.selectedPieceId) place(engine.selectedPieceId, word.id, slot);
                    else if (pieceId) engine.liftPiece(word.id, slot);
                    else setAnnouncement("Choose a word part from the bank first.");
                  }}>{piece?.text ?? "+"}</button>;
                })}
              </div>}
            </li>;
          })}
        </ol>
        <div className={styles.rootLabel}><span>{family.origin} root</span><strong>{family.root}</strong><span>{family.meaning}</span></div>
      </div>
    </div>
    <div className={styles.familyNavigation}>{onBack ? <button type="button" className="brand-secondary-btn" onClick={onBack}>Previous family</button> : <span />}<button type="button" className="brand-primary-btn" disabled={completed.length !== family.words.length} onClick={onNext}>{familyIndex + 1 < familyCount ? "Next root family" : "Continue to spell class"}</button></div>
  </section>;
}
