"use client";
import type { HomophonePassage } from "@/lib/adle/homophone/lesson";
import type { PairedDegreeSentence } from "@/lib/adle/inflection/contracts";

type Passage = HomophonePassage | PairedDegreeSentence;
export type PassageSet = { id: string; passages: Passage[] };
const input =
  "min-w-0 w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-sm";
export function PairedDictationEditor(props: {
  sets: PassageSet[];
  onChange: (sets: PassageSet[]) => void;
}) {
  const word = (target: Passage["targets"][number]) =>
    typeof target === "string" ? target : target.word;
  return (
    <div className="mt-3 grid gap-2">
      {props.sets.map((set, setIndex) => (
        <details
          key={set.id}
          className="rounded border border-[var(--border)] p-2"
        >
          <summary className="cursor-pointer text-sm font-medium">
            {setIndex === 0
              ? "Primary paired passages"
              : `Paired passage variant ${setIndex + 1}`}
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="td-reflow-table w-full text-left text-sm">
              <thead className="text-xs text-[color:var(--mid)]">
                <tr>
                  <th>Before</th>
                  <th>Target 1</th>
                  <th>Between</th>
                  <th>Target 2</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {set.passages.map((passage, passageIndex) => (
                  <tr key={passage.id}>
                    {[0, 1, 2].flatMap((segment, index) => [
                      <td key={`segment-${segment}`} className="p-1">
                        <input
                          aria-label={`Passage ${passageIndex + 1} segment ${segment + 1}`}
                          className={input}
                          value={passage.segments[segment]}
                          onChange={(event) =>
                            props.onChange(
                              props.sets.map((old, at) =>
                                at === setIndex
                                  ? {
                                      ...old,
                                      passages: old.passages.map((prior, p) =>
                                        p === passageIndex
                                          ? {
                                              ...prior,
                                              segments: prior.segments.map(
                                                (text, s) =>
                                                  s === segment
                                                    ? event.target.value
                                                    : text,
                                              ) as [string, string, string],
                                            }
                                          : prior,
                                      ),
                                    }
                                  : old,
                              ),
                            )
                          }
                        />
                      </td>,
                      ...(index < 2
                        ? [
                            <td
                              key={`target-${index}`}
                              className="p-2 font-medium"
                            >
                              {word(passage.targets[index])}
                            </td>,
                          ]
                        : []),
                    ])}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {setIndex > 0 && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="text-sm text-[color:var(--scarlett)] underline"
                onClick={() =>
                  props.onChange(props.sets.filter((_, at) => at !== setIndex))
                }
              >
                Remove variant
              </button>
            </div>
          )}
        </details>
      ))}
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded-lg bg-[var(--scarlett)] px-3 py-2 text-sm font-semibold text-white"
          onClick={() => {
            const first = props.sets[0];
            if (first)
              props.onChange([
                ...props.sets,
                {
                  id: crypto.randomUUID(),
                  passages: structuredClone(first.passages).map((p) => ({
                    ...p,
                    id: crypto.randomUUID(),
                    segments: ["", "", ""] as [string, string, string],
                  })),
                },
              ]);
          }}
        >
          Add paired passage variant
        </button>
      </div>
    </div>
  );
}
