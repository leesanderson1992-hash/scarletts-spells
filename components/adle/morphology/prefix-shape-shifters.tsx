const meanings = [
  { title: "NOT or OPPOSITE OF", frequency: "Frequently", pill: "bg-emerald-100 text-emerald-900",
    description: "Turn a word into its opposite.", examples: [
      ["im + possible → impossible", "not possible"],
      ["il + legal → illegal", "not legal"],
      ["ir + regular → irregular", "not regular"],
    ] },
  { title: "IN, INTO or WITHIN", frequency: "Sometimes", pill: "bg-blue-100 text-blue-900",
    description: "Move or put something inside.", examples: [
      ["im + port → import", "carry into a country"],
      ["im + prison → imprison", "put into prison"],
      ["im + plant → implant", "put inside something"],
    ] },
  { title: "MAKE or CAUSE TO BECOME", frequency: "Rarely", pill: "bg-purple-100 text-purple-900",
    description: "Cause something to change.", examples: [
      ["inflame · cause to become inflamed", "Make something swollen or irritated."],
      ["intensify · make stronger", "Make something more intense. Here, -ify carries the ‘make’ meaning."],
      ["impoverish · make poor", "Cause someone to become poor."],
    ] },
] as const;
const rules = [
  ["im-", "Before b, m or p", "impossible · immature · imbalance"],
  ["il-", "Before l", "illegal · illogical"],
  ["ir-", "Before r", "irregular · irresponsible"],
  ["in-", "Before most other letters", "incorrect · invisible"],
] as const;

export function PrefixShapeShifters({ pageNumber, pageCount }: { pageNumber: number; pageCount: number }) {
  return <article className="grid gap-3 text-left" aria-labelledby="prefix-shape-shifters-title">
    <header>
      <p className="text-xs font-black uppercase tracking-widest text-[color:var(--scarlett)]">Learn · Page {pageNumber} of {pageCount}</p>
      <h1 id="prefix-shape-shifters-title" className="mt-1 text-2xl font-black text-white">The prefix shape-shifters</h1>
      <p className="mt-1 text-sm text-cyan-50">These prefixes change shape to make words easier to say.</p>
      <p className="mt-1 font-black text-[color:var(--scarlett)]">in- · im- · il- · ir-</p>
    </header>
    <div className="grid gap-3 lg:grid-cols-3" aria-label="Three prefix meanings">
      {meanings.map((meaning, index) => <section key={meaning.title} className="min-w-0 rounded-2xl border border-pink-100 bg-white p-3 text-slate-950">
        <div className="mb-2 flex justify-end"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${meaning.pill}`}>{meaning.frequency}</span></div>
        <h2 className="text-sm font-black"><span className="mr-2 text-pink-700">{index + 1}</span>{meaning.title}</h2>
        <p className="mt-1 text-xs text-slate-600">{meaning.description}</p>
        <ul className="mt-3 divide-y divide-slate-200">{meaning.examples.map(([word, explanation]) => <li key={word} className="py-2">
          <p className="text-sm font-bold">{word}</p><p className="mt-0.5 text-xs text-slate-600">{explanation}</p>
        </li>)}</ul>
      </section>)}
    </div>
    <section className="rounded-2xl border border-amber-300 bg-amber-100 p-3 text-amber-950" aria-labelledby="prefix-spelling-hack">
      <h2 id="prefix-spelling-hack" className="font-black">The spelling hack</h2>
      <p className="text-xs">Look at the first letter of the base word.</p>
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">{rules.map(([prefix, rule, examples]) => <div key={prefix} className="min-w-0 rounded-xl bg-amber-50 p-2.5">
        <h3 className="text-xl font-black text-amber-800">{prefix}</h3><p className="mt-1 text-xs"><strong className="font-black">{rule}</strong></p>
        <p className="mt-1 break-words text-xs text-amber-900">{examples}</p>
      </div>)}</div>
      <p className="mt-2 text-sm font-bold">Meaning first. Then choose the prefix shape.</p>
      <p className="text-xs">The spelling hack works especially well for NOT.</p>
    </section>
  </article>;
}
