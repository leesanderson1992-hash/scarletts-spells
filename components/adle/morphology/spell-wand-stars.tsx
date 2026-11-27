"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useReducedMotion } from "@/components/adle/activities/shared/motion";
import styles from "./latin-root-lesson.module.css";

type Star = { id: number; x: number; y: number; dx: number; dy: number };
export function SpellWandStars({ children }: { children: ReactNode }) {
  const [stars, setStars] = useState<Star[]>([]);
  const nextId = useRef(0);
  const lastTrail = useRef(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) return;
    const frame = requestAnimationFrame(() => setStars([]));
    return () => cancelAnimationFrame(frame);
  }, [reduced]);
  function shoot(event: PointerEvent<HTMLDivElement>, burst: boolean) {
    if (reduced || (!burst && event.pointerType !== "mouse")) return;
    if (!burst && event.timeStamp - lastTrail.current < 65) return;
    lastTrail.current = event.timeStamp;
    const bounds = event.currentTarget.getBoundingClientRect();
    const count = burst ? 7 : 1;
    const particles = Array.from({ length: count }, (_, index) => {
      const angle = burst ? index * Math.PI * 2 / count : -Math.PI / 2;
      return { id: nextId.current++, x: event.clientX - bounds.left, y: event.clientY - bounds.top, dx: Math.cos(angle) * (burst ? 45 : 12), dy: Math.sin(angle) * (burst ? 45 : 25) };
    });
    setStars(previous => [...previous, ...particles].slice(-40));
  }
  return <div className={styles.wandSurface} onPointerMove={event => shoot(event, false)} onPointerDown={event => shoot(event, true)}>
    {children}
    <div className={styles.wandParticles} aria-hidden="true">{stars.map(star => <span key={star.id} data-wand-star style={{ left: star.x, top: star.y, "--star-dx": `${star.dx}px`, "--star-dy": `${star.dy}px` } as CSSProperties} onAnimationEnd={() => setStars(previous => previous.filter(candidate => candidate.id !== star.id))}>✦</span>)}</div>
  </div>;
}
