"use client";
import { useState, useTransition } from "react";
import { findTeachingDictionaryWord } from "./actions";

type Component = {
  ordinal: number;
  canonicalWordId: string;
  displaySurface: string;
  meaning: string;
  sense: string | null;
};
const input =
  "w-full min-w-24 rounded border border-[var(--border)] bg-white px-2 py-1 text-sm";
export function CompoundPartsEditor(props: {
  components: Component[];
  joins: string[];
  onChange: (components: Component[], joins: string[]) => void;
}) {
  const [lookup, setLookup] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{ id: string; word: string }[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const update = (at: number, values: Partial<Component>) =>
    props.onChange(
      props.components.map((part, index) =>
        index === at ? { ...part, ...values } : part,
      ),
      props.joins,
    );
  return (
    <div className="mt-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr>
              <th>Component word</th>
              <th>Meaning in this word</th>
              <th>Sense</th>
              <th>Join before</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {props.components.map((part, index) => (
              <tr key={index}>
                <td className="p-1">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setLookup(index);
                      setQuery(part.displaySurface);
                      setMatches([]);
                    }}
                  >
                    {part.displaySurface || "Select word"} ✎
                  </button>
                </td>
                <td className="p-1">
                  <input
                    aria-label={`Component ${index + 1} meaning`}
                    className={input}
                    value={part.meaning}
                    onChange={(e) => update(index, { meaning: e.target.value })}
                  />
                </td>
                <td className="p-1">
                  <input
                    aria-label={`Component ${index + 1} sense`}
                    className={input}
                    value={part.sense ?? ""}
                    onChange={(e) =>
                      update(index, { sense: e.target.value || null })
                    }
                  />
                </td>
                <td className="p-1">
                  {index > 0 && (
                    <select
                      aria-label={`Join before component ${index + 1}`}
                      className={input}
                      value={props.joins[index - 1] ?? "none"}
                      onChange={(e) =>
                        props.onChange(
                          props.components,
                          props.joins.map((join, at) =>
                            at === index - 1 ? e.target.value : join,
                          ),
                        )
                      }
                    >
                      <option value="none">None</option>
                      <option value="space">Space</option>
                      <option value="hyphen">Hyphen</option>
                    </select>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="text-[color:var(--scarlett)] underline"
                    onClick={() =>
                      props.onChange(
                        props.components
                          .filter((_, at) => at !== index)
                          .map((part, at) => ({ ...part, ordinal: at + 1 })),
                        props.joins.slice(
                          0,
                          Math.max(0, props.components.length - 2),
                        ),
                      )
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lookup !== null && (
        <div className="mt-2 rounded border p-3">
          <div className="flex gap-2">
            <input
              aria-label="Find component dictionary word"
              className={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              disabled={pending}
              className="text-sm underline"
              onClick={() =>
                start(async () => {
                  setError("");
                  try {
                    setMatches(await findTeachingDictionaryWord(query));
                  } catch {
                    setError("Word search failed. Please try again.");
                  }
                })
              }
            >
              {pending ? "Searching…" : "Find word"}
            </button>
            <button
              type="button"
              className="text-sm underline"
              onClick={() => setLookup(null)}
            >
              Close
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          <ul className="mt-2 flex flex-wrap gap-2">
            {matches.map((word) => (
              <li key={word.id}>
                <button
                  type="button"
                  className="rounded-full bg-[var(--paper)] px-3 py-1"
                  onClick={() => {
                    update(lookup, {
                      canonicalWordId: word.id,
                      displaySurface: word.word,
                    });
                    setLookup(null);
                  }}
                >
                  {word.word}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className="rounded-lg bg-[var(--scarlett)] px-3 py-2 text-sm font-semibold text-white"
          onClick={() =>
            props.onChange(
              [
                ...props.components,
                {
                  ordinal: props.components.length + 1,
                  canonicalWordId: "",
                  displaySurface: "",
                  meaning: "",
                  sense: null,
                },
              ],
              props.components.length ? [...props.joins, "none"] : [],
            )
          }
        >
          Add component
        </button>
      </div>
    </div>
  );
}
