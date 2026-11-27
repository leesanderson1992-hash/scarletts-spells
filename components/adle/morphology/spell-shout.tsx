"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import styles from "./latin-root-lesson.module.css";

export function SpellShout({ spellName, run, muted, onMutedChange, onReplay, onChange, onContinue }: {
  spellName: string; run: number; muted: boolean; onMutedChange: (muted: boolean) => void;
  onReplay: () => void; onChange: () => void; onContinue: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element?.open) element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className={styles.shoutDialog} aria-labelledby={heading} onCancel={event => { event.preventDefault(); onChange(); }}>
    <div className={styles.shoutVisual} key={run} data-spell-shout style={{ "--spell-length": Math.max(spellName.length + 1, 6) } as CSSProperties}>
      <div className={styles.comicBurst}><div className={styles.comicBurstFill} /><h2 id={heading}>{spellName}!</h2></div>
      <div className={styles.shoutStars} aria-hidden="true">{Array.from({ length: 22 }, (_, index) => {
        const angle = index * Math.PI * 2 / 22;
        return <span key={index} style={{ "--shout-dx": `${Math.cos(angle) * (36 + index % 3 * 4)}vw`, "--shout-dy": `${Math.sin(angle) * (27 + index % 4 * 3)}dvh`, "--star-delay": `${index % 4 * 40}ms` } as CSSProperties}>✦</span>;
      })}</div>
    </div>
    <footer className={styles.shoutControls}>
      <button type="button" className="brand-secondary-btn" onClick={onReplay}>Cast again</button>
      <button type="button" className="brand-secondary-btn" onClick={() => onMutedChange(!muted)} aria-pressed={muted}>{muted ? "Sound off" : "Sound on"}</button>
      <button type="button" className="brand-secondary-btn" onClick={onChange}>Change my spell</button>
      <button type="button" className="brand-primary-btn" onClick={onContinue}>Continue to cover & check</button>
    </footer>
  </dialog>;
}
