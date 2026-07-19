import { readFileSync } from "node:fs";

const source = readFileSync("components/adle/activities/shared/base-word-cleaver.tsx", "utf8");

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(source.includes('Chop off the parts that are not the base word.'), "cleaver prompt must not disclose the base word");
assert(source.includes("const letters = Array.from(props.word);"), "cleaver must begin with individual letter boxes");
assert(source.includes("What word remains?"), "cleaver must ask for the remaining word before confirming the base");
assert(!source.includes("Chop the word until only <span"), "cleaver must not name the base in its heading before a chop");
assert(!source.includes("props.segments.map((segment, index) =>"), "cleaver must not render reviewed morphology groups before a chop");

console.log("adle-base-word-cleaver-regression: ok");
