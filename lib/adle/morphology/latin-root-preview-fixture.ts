import type { LatinRootLessonContent, LatinRootLessonWord } from "./latin-root-lesson";
// Illustrative design fixtures. These do not establish dictionary review or family membership.
const p = (text: string, meaning: string, role: "prefix" | "root" | "suffix") => ({ text, meaning, role });
const port = p("port", "carry", "root");
const struct = p("struct", "build", "root");
const words: Record<string, LatinRootLessonWord> = {
  transport: { id: "transport", word: "transport", meaning: "Carry from one place to another.", parts: [p("trans", "across", "prefix"), port], sentence: "We transport the boxes by train.", target: true },
  portable: { id: "portable", word: "portable", meaning: "Able to be carried.", parts: [port, p("able", "able to be", "suffix")], sentence: "The portable lamp fits in my bag." },
  import: { id: "import", word: "import", meaning: "Bring goods into a country.", parts: [p("im", "in or into", "prefix"), port], sentence: "We import fruit from other countries." },
  export: { id: "export", word: "export", meaning: "Send goods out of a country.", parts: [p("ex", "out", "prefix"), port], sentence: "They export apples to other countries." },
  porter: { id: "porter", word: "porter", meaning: "A person whose work includes carrying luggage.", parts: [port, p("er", "person who", "suffix")], sentence: "The porter carried our bags." },
  transportation: { id: "transportation", word: "transportation", meaning: "The movement of people or goods from place to place.", parts: [p("trans", "across", "prefix"), port, p("ation", "action or process", "suffix")], sentence: "The city needs reliable transportation.", parentWordId: "transport" },
  construct: { id: "construct", word: "construct", meaning: "Build something by putting parts together.", parts: [p("con", "together", "prefix"), struct], sentence: "We construct a bridge from wooden blocks.", target: true },
  structure: { id: "structure", word: "structure", meaning: "Something built, such as a bridge or building.", parts: [struct, p("ure", "result", "suffix")], sentence: "The bridge is a strong structure." },
  construction: { id: "construction", word: "construction", meaning: "The process of building something.", parts: [p("con", "together", "prefix"), struct, p("ion", "action or process", "suffix")], sentence: "The construction of the bridge took a year.", parentWordId: "construct" },
};
export function latinRootPreviewContent(familyCount: 1 | 2, count: 5 | 6): LatinRootLessonContent {
  return { id: `latin-root-preview-${familyCount}-${count}`, families: familyCount === 1 ? [
    { id: "port", root: "port", meaning: "Carry", origin: "Latin", spellAnimations: ["carry_bag", "carry_book", "carry_basket"], spellEffects: ["Float my bag to the door", "Carry a book across the room", "Move a basket onto a shelf"], words: ["transport", "portable", "import", "export", "porter", "transportation"].slice(0, count).map(key => ({ ...words[key], target: key === "transport" || key === "portable" })) },
  ] : [
    { id: "port", root: "port", meaning: "Carry", origin: "Latin", spellAnimations: ["carry_bag", "carry_book", "carry_basket"], spellEffects: ["Float my bag to the door", "Carry a book across the room", "Move a basket onto a shelf"], words: ["transport", "portable", "import"].map(key => words[key]) },
    { id: "struct", root: "struct", meaning: "Build", origin: "Latin", spellAnimations: ["build_bridge", "build_treehouse", "build_shelter"], spellEffects: ["Build a bridge from blocks", "Assemble a cosy treehouse", "Build a shelter for a creature"], words: ["construct", "structure", "construction"].slice(0, count - 3).map(key => words[key]) },
  ] };
}
