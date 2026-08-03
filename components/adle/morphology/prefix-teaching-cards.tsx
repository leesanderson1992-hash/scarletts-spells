import type { MorphologyPrefixTeachingCardV1 } from "@/lib/adle/morphology/payload";
import { selectedPrefixFeedbackText } from "@/lib/adle/morphology/prefix-teaching-feedback";

export function PrefixTeachingCards(props: {
  cards: readonly MorphologyPrefixTeachingCardV1[];
  compact?: boolean;
}) {
  const gridClass = props.cards.length === 1
    ? "mx-auto w-full max-w-xl"
    : props.cards.length === 3
      ? "md:grid-cols-2 lg:grid-cols-3"
      : "md:grid-cols-2";
  return (
    <div className={`grid gap-3 ${gridClass}`}>
      {props.cards.map((card) => (
        <article key={card.text} className={`rounded-3xl border-2 border-cyan-200 bg-white text-left text-slate-950 shadow-sm ${props.compact ? "p-4" : "p-5"}`}>
          <h3 className={props.compact ? "text-2xl font-black text-cyan-900" : "text-3xl font-black text-cyan-900"}>{card.label}</h3>
          <p className="mt-3"><span className="font-black">Meaning:</span> {card.meaning}</p>
          <div className="mt-3 rounded-2xl bg-cyan-50 p-3">
            <p className="font-black">{card.rules.length === 1 ? "Rule:" : "Rules:"}</p>
            {card.rules.length === 1 ? <p className="mt-1">{card.rules[0]}</p> : (
              <ul className="mt-1 list-disc space-y-1 pl-5">{card.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
            )}
          </div>
          {card.example ? (
            <p className="mt-3 text-sm font-semibold text-slate-700">
              <span className="font-black">Example:</span> {card.example.prefix} + {card.example.base} → {card.example.word} — {card.example.meaning}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function SelectedPrefixFeedback(props: { card: MorphologyPrefixTeachingCardV1 }) {
  const lines = selectedPrefixFeedbackText(props.card).split("\n");
  return (
    <span className="block rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-amber-950">
      {lines.map((line, index) => <span key={`${index}:${line}`} className={`block ${index === 0 || index === 1 || index === lines.length - 1 ? "font-black" : ""} ${index === 1 || index === lines.length - 1 ? "mt-2" : ""}`}>{line}</span>)}
    </span>
  );
}
