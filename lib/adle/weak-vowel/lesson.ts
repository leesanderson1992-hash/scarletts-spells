import type { TeachingPagesConfig, WeakVowelSecretTip } from "@/components/adle/first-impression/teaching-pages";
import { parseDinnerRound, type DinnerRoundV1 } from "../word-lab/call-it-to-dinner";
import { parseDetectiveRound, type DetectiveRoundV1 } from "../word-lab/family-tree-detective";
import { WEAK_VOWEL_MICRO_SKILLS } from "../word-lab/weak-vowel-dinner";
import { isWeakVowelAudioSource } from "./audio-source";

export const WEAK_VOWEL_LESSON_VERSION = 1 as const;
export type WeakVowelMicroSkill = typeof WEAK_VOWEL_MICRO_SKILLS[number];
export type WeakVowelWordProvenance = "learning_item" | "probe_miss" | "stretch";

export interface WeakVowelLessonWordV1 {
  canonicalWordId: string;
  spelling: string;
  provenance: WeakVowelWordProvenance;
  learningItemId: string | null;
  /** Exact reviewed route-content JSON digest bound by the publication row. */
  routeContentSha256?: string;
  definition: { text: string; sourceFingerprint: string; reviewStatus: "approved" | "candidate" };
  dinner: DinnerRoundV1;
  detective: DetectiveRoundV1;
  dictation: {
    sentence: string;
    targetStart: number;
    targetEnd: number;
    recording: { src: string; sha256: string; reviewStatus: "approved" };
  };
}

/** This is the immutable learner payload, not a query against a live sheet. */
export interface WeakVowelLessonV1 {
  schemaVersion: typeof WEAK_VOWEL_LESSON_VERSION;
  routeKey: "weak_vowel_word_lab";
  contentVersion: string;
  assignmentKey: string;
  authority: "governed_release" | "dev_fixture";
  microSkillKey: WeakVowelMicroSkill;
  words: readonly WeakVowelLessonWordV1[];
  teaching: TeachingPagesConfig;
  reflectionPrompt: string;
}

const descriptions: Record<WeakVowelMicroSkill, { name: string; focus: string; strategy: string }> = {
  D4_SCHWA_FINAL_A_FINAL: { name: "Quiet final a", focus: "Some words end with a written a that sounds weak when we speak.", strategy: "Look carefully at the final a. Say the whole word, then picture its ending before you spell it." },
  D4_SCHWA_FINAL_AR_FINAL: { name: "Quiet final ar", focus: "A final ar can sound much less clear than its spelling looks.", strategy: "Remember both letters at the end. Compare the written ending with the sound in the reviewed word." },
  D4_SCHWA_FINAL_ER_FINAL: { name: "Quiet final er", focus: "A final er may be an ending or part of a base word. The spelling needs its own check.", strategy: "Look for a verified base and ending when one exists. Do not assume every word ending in er was made by adding a suffix." },
  D4_SCHWA_FINAL_OR_FINAL: { name: "Quiet final or", focus: "Some words end in written or even when the final vowel sounds weak.", strategy: "Notice the whole or ending and use the written word to remember it." },
  D4_SCHWA_INITIAL_A_INITIAL: { name: "Quiet first a", focus: "Some words begin with a written a that is weak when we speak.", strategy: "Find the strong beat, then remember the written a at the start." },
  D4_SCHWA_INITIAL_E_INITIAL: { name: "Quiet first e", focus: "An initial written e can be unstressed and easy to miss by ear.", strategy: "Listen to the complete word, then inspect its first letters before recalling the spelling." },
  D4_SCHWA_INITIAL_O_INITIAL: { name: "Quiet first o", focus: "An initial written o can be unstressed and easy to miss by ear.", strategy: "Listen to the complete word, then inspect its first letters before recalling the spelling." },
  D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS: { name: "Quiet middle vowels", focus: "A vowel in the middle of a word may be weak without disappearing from its spelling.", strategy: "Chop the spoken word into syllables, locate the quiet part, and inspect the letters that spell it." },
  D4_SCHWA_FINAL_AL: { name: "Quiet final al", focus: "The written a in -al can sound weak, including when -ly follows it.", strategy: "Look for the -al spelling in the word and its verified relatives." },
  D4_SCHWA_FINAL_ET: { name: "Quiet final et", focus: "The weak vowel in lexical final -et is written e.", strategy: "Listen to the reviewed recording, then picture the complete -et ending before spelling it." },
};

const INITIAL_A_TIPS: readonly WeakVowelSecretTip[] = [
  { heading: "Detective Tip 1: Find the strong beat", blocks: [
    { kind: "paragraph", text: "Say **about**, **around**, **away** and **again**. The first syllable is quieter than the syllable that follows." },
    { kind: "paragraph", text: "Look at the beginning of each written word. Keep its **a** even when the vowel is hard to hear." },
  ] },
  { heading: "Detective Tip 2: Check the spelling", blocks: [
    { kind: "paragraph", text: "A quiet first vowel does not tell you its letter. Other words begin with quiet **e** or **o**." },
    { kind: "paragraph", text: "Listen to the chosen word audio and remember the written beginning of the whole word." },
  ] },
];

const INITIAL_E_TIPS: readonly WeakVowelSecretTip[] = [
  { heading: "Detective Tip 1: Find the strong beat!", blocks: [
    { kind: "paragraph", text: "Listen to these words and notice the strong syllable:" },
    { kind: "examples", items: [
      { text: "e-**VENT**" }, { text: "e-**FFECT**" }, { text: "e-**SCAPE**" },
      { text: "e-**NOUGH**" }, { text: "e-**LEC**-tric" },
    ] },
    { kind: "paragraph", text: "Try clapping once for each syllable and making the stressed syllable louder." },
    { kind: "paragraph", text: "**Detective trick:** When the first syllable is quiet, listen carefully to its weak vowel before checking the written **e**." },
  ] },
  { heading: "Detective Tip 2: Look for the ex- spelling pattern!", blocks: [
    { kind: "paragraph", text: "Some words begin with **ex-**, where the **e** is weak:" },
    { kind: "examples", items: [
      { text: "**ex**plain" }, { text: "**ex**plore" }, { text: "**ex**press" },
      { text: "**ex**plode" }, { text: "**ex**treme" },
    ] },
    { kind: "paragraph", text: "Listen carefully to the beginning. The **e** is weak, but the **x** still makes its consonant sound. In a common British pronunciation, **explain** begins /ɪk/, with the short /ɪ/ vowel rather than a schwa /ə/." },
    { kind: "paragraph", text: "**Detective trick:** Remember the **ex-** spelling pattern, but do not assume every weak vowel is a schwa." },
  ] },
  { heading: "Detective Tip 3: Look for word families!", blocks: [
    { kind: "paragraph", text: "Related words can help you remember the spelling of a weak initial **e**:" },
    { kind: "examples", items: [
      { text: "**effect** → effective → effectiveness" },
      { text: "**electric** → electrical → electricity" },
      { text: "**emotion** → emotional → emotionally" },
      { text: "**event** → eventful → eventual" },
    ] },
    { kind: "paragraph", text: "Pronunciation and stress may change as a word grows, but these families keep the first written **e**." },
    { kind: "paragraph", text: "**Detective trick:** Find related words and look for the letters that stay the same!" },
  ] },
  { heading: "Detective Tip 4: Beware of the sneaky short I!", blocks: [
    { kind: "paragraph", text: "A quiet first **e** is not necessarily a schwa. In common British pronunciations, these words begin with short /ɪ/:" },
    { kind: "examples", items: [{ text: "**e**xamine" }, { text: "**e**xplain" }, { text: "**e**xist" }] },
    { kind: "paragraph", text: "The short /ɪ/ and schwa /ə/ can sound similar in quick speech." },
    { kind: "paragraph", text: "**Memory trick:** Listen to the chosen recording, then use a spelling clue to remember the **e**." },
  ] },
  { heading: "Detective Tip 5: Don't trust your ears alone!", blocks: [
    { kind: "paragraph", text: "Compare the quiet first vowels in **e**vent, **a**bout and **o**ccasion. Their sounds are not necessarily the same, and each word begins with a different letter." },
    { kind: "paragraph", text: "Your ears can help you find a weak vowel, but they cannot always tell you how to spell it." },
    { kind: "paragraph", text: "That's why a spelling detective looks for **word families, spelling patterns and meaning**." },
  ] },
];

const INITIAL_O_TIPS: readonly WeakVowelSecretTip[] = [
  { heading: "Detective Tip 1: Find the strong beat!", blocks: [
    { kind: "paragraph", text: "Say these words aloud and listen for the strongest syllable:" },
    { kind: "examples", items: [
      { text: "o-**CCAS**-ion" }, { text: "o-**PPOSE**" },
      { text: "o-**FFI**-cial" }, { text: "ob-**SERVE**" },
    ] },
    { kind: "paragraph", text: "Try clapping the syllables and giving the loudest clap to the stressed syllable." },
    { kind: "paragraph", text: "**Detective trick:** If the first **o** is quiet and sounds like “uh”, you may have found a schwa. An unstressed **o** does not always become a schwa; follow the chosen recording." },
  ] },
  { heading: "Detective Tip 2: Look for the double consonant!", blocks: [
    { kind: "paragraph", text: "Some words with a quiet initial **o** have two of the same consonant near the beginning:" },
    { kind: "examples", items: [
      { text: "**occ**asion" }, { text: "**opp**ose" }, { text: "**off**icial" },
      { text: "**occ**ur" }, { text: "**opp**onent" },
    ] },
    { kind: "paragraph", text: "Can you spot **cc**, **pp** and **ff**?" },
    { kind: "paragraph", text: "**Memory trick:** Some quiet-**o** words have a double consonant just after the first vowel. A double consonant alone does not prove there is a schwa." },
  ] },
  { heading: "Detective Tip 3: Ask the word's relatives!", blocks: [
    { kind: "paragraph", text: "A related word can help you remember the first written **o**:" },
    { kind: "examples", items: [
      { text: "**occasion** → occasional → occasionally" },
      { text: "**oppose** → opposition → opponent" },
      { text: "**observe** → observation → observer" },
      { text: "**occur** → occurred → occurrence" },
      { text: "**official** → officially" },
    ] },
    { kind: "paragraph", text: "The spelling may stay while the sound changes. For example, British **observe** starts with schwa /ə/, but **observation** starts with /ɒ/ and has secondary stress there." },
    { kind: "paragraph", text: "**Detective trick:** If you are unsure which vowel to write, look for a related word you already know. Do not assume it has the same vowel sound." },
  ] },
  { heading: "Detective Tip 4: Not every initial O is lazy!", blocks: [
    { kind: "paragraph", text: "These words begin with a stressed vowel rather than an initial schwa in standard British English:" },
    { kind: "examples", items: [{ text: "**o**pen" }, { text: "**o**cean" }, { text: "**o**range" }, { text: "**o**ffer" }] },
    { kind: "paragraph", text: "They begin with **o**, but they are not examples of the quiet initial-**o** pattern." },
    { kind: "paragraph", text: "**Detective trick:** Do not rely on the first letter alone. Listen for the vowel and find the stressed syllable." },
  ] },
  { heading: "Detective Tip 5: Don't trust your ears alone!", blocks: [
    { kind: "paragraph", text: "Compare **o**ccasion and **a**bout: both start with a quiet schwa in common British pronunciations. **E**vent starts with a weak /ɪ/ instead." },
    { kind: "paragraph", text: "Their different spellings show why hearing a weak vowel is not enough to choose its letter." },
    { kind: "paragraph", text: "A spelling detective also looks for **spelling patterns, word families and memory clues**." },
  ] },
];

const MEDIAL_WEAK_TIPS: readonly WeakVowelSecretTip[] = [
  { heading: "Detective Tip 1: The disappearing vowel trick!", blocks: [
    { kind: "paragraph", text: "Look at **f a m i l y**. In a three-syllable pronunciation, the middle vowel is weak: **FAM-uh-lee**. Some speakers compress the word to **FAM-lee**." },
    { kind: "paragraph", text: "The written **i** remains in both cases, even when the middle vowel is not heard as a separate sound." },
    { kind: "paragraph", text: "**Detective trick:** When a word sounds shorter than it looks, search for a hidden written vowel. Use the recording you are given when counting syllables." },
  ] },
  { heading: "Detective Tip 2: Find the strong beat!", blocks: [
    { kind: "paragraph", text: "Listen for the part with the strongest beat:" },
    { kind: "examples", items: [
      { text: "**FAM**-uh-lee" }, { text: "**DIF**-uh-runt" },
      { text: "**EV**-ree" }, { text: "**KAM**-ruh" }, { text: "**CHOK**-lut" },
    ] },
    { kind: "paragraph", text: "The other parts are less stressed. Their vowels may be quieter, sound like schwa /ə/, or, in some pronunciations, no longer form a separate syllable." },
    { kind: "paragraph", text: "**Detective trick:** Find the strong beat, then investigate the quieter parts of the recorded word." },
  ] },
  { heading: "Detective Tip 3: Use your spelling voice!", blocks: [
    { kind: "paragraph", text: "Your **speaking voice** sounds natural. Your **spelling voice** deliberately says the written parts to help you remember every vowel:" },
    { kind: "comparison", columns: ["Speaking voice", "Spelling voice"], rows: [
      ["FAM-lee (compressed)", "FAM-i-ly"], ["BIZ-niss", "BUS-i-ness"],
      ["DIF-uh-runt (chosen recording)", "DIF-fer-ent"], ["EV-ree", "EV-er-y"],
      ["KAM-ruh", "CAM-er-a"], ["CHOK-lut", "CHOC-o-late"],
    ] },
    { kind: "paragraph", text: "The spelling voice is a memory trick, **not** a claim about how the word is normally pronounced." },
    { kind: "paragraph", text: "**Memory trick:** Speak naturally, but spell every letter!" },
  ] },
  { heading: "Detective Tip 4: Ask the word's relatives!", blocks: [
    { kind: "paragraph", text: "Sometimes a related word gives a weak vowel a clearer sound:" },
    { kind: "examples", items: [{ text: "**human → humanity**" }, { text: "**photograph → photography**" }] },
    { kind: "paragraph", text: "The written **a** in **human** is weak /ə/, but in **humanity** it becomes /æ/. The second written **o** in British **photograph** is weak /ə/, but in **photography** it is /ɒ/." },
    { kind: "paragraph", text: "**Detective trick:** A verified relative may reveal a spelling clue. Not every family has a helpful sound change." },
  ] },
  { heading: "Detective Tip 5: Beware of the vowel traps!", blocks: [
    { kind: "paragraph", text: "These spellings include a vowel that can be easy to miss by ear:" },
    { kind: "examples", items: [
      { text: "fam**i**ly" }, { text: "diff**e**rent" }, { text: "choc**o**late" },
      { text: "cam**e**ra" }, { text: "ev**e**ry" }, { text: "bus**i**ness" },
    ] },
    { kind: "paragraph", text: "**Detective trick:** Picture the whole word and check every vowel, even when the sound is weak or absent in a compressed pronunciation." },
  ] },
  { heading: "Detective Tip 6: Don't trust your ears alone!", blocks: [
    { kind: "paragraph", text: "A written middle vowel may make a quiet sound such as schwa /ə/, keep another unstressed vowel sound, or disappear as a separate sound in a compressed pronunciation." },
    { kind: "paragraph", text: "These are different possibilities. The number of syllables comes from the chosen recording, not from the number of written vowel letters." },
    { kind: "paragraph", text: "Spelling detectives use **sound, word families, spelling patterns and memory** together." },
  ] },
];

const FINAL_AR_TIPS: readonly WeakVowelSecretTip[] = [
  { heading: "Detective Tip 1: Listen for the lazy AR!", blocks: [
    { kind: "paragraph", text: "Say **sugar**. Can you hear the strong **ar** sound from **car**? The last syllable is unstressed, so its vowel sounds like a quiet **‘uh’** /ə/." },
    { kind: "paragraph", text: "**Remember:** At the end of some words, **ar** whispers ‘uh’!" },
  ] },
  { heading: "Detective Tip 2: Spot the -ular pattern!", blocks: [
    { kind: "paragraph", text: "Some words share the written ending **-ular**:" },
    { kind: "examples", items: [{ text: "reg**ular**" }, { text: "pop**ular**" }, { text: "partic**ular**" }, { text: "circ**ular**" }] },
    { kind: "paragraph", text: "**Remember:** Spot **-ular**, spell **u-l-a-r**! This is a spelling pattern, not a claim that these words share one base family." },
  ] },
  { heading: "Detective Tip 3: Check -ilar and -iliar!", blocks: [
    { kind: "paragraph", text: "These endings look alike, but they are not spelt the same:" },
    { kind: "examples", items: [{ text: "sim**ilar** → -ilar" }, { text: "fam**iliar** → -iliar" }] },
    { kind: "paragraph", text: "**Remember:** **similar** ends **i-l-a-r**; **familiar** has an extra **i**: **i-l-i-a-r**." },
  ] },
  { heading: "Detective Tip 4: Ask the word's relatives!", blocks: [
    { kind: "paragraph", text: "A related word can sometimes make a hidden vowel clearer: **popular → popularity**." },
    { kind: "paragraph", text: "In British English **popular**, the final written **a** sounds like /ə/. In **popularity**, that **a** is heard more clearly as /æ/." },
    { kind: "paragraph", text: "**Remember:** A word's relatives can provide a clue, but not every relative reveals the sound." },
  ] },
  { heading: "Detective Tip 5: Remember the tricky AR words!", blocks: [
    { kind: "paragraph", text: "Some words need extra spelling practice:" },
    { kind: "examples", items: [{ text: "sug**ar**" }, { text: "doll**ar**" }, { text: "calend**ar**" }, { text: "gramm**ar**" }, { text: "pill**ar**" }, { text: "cell**ar**" }] },
    { kind: "paragraph", text: "**Remember:** Even when **ar** whispers ‘uh’, we still write **ar**!" },
  ] },
  { heading: "Detective Tip 6: Don't trust your ears!", blocks: [
    { kind: "paragraph", text: "These endings can all sound like a quiet ‘uh’ in British English:" },
    { kind: "examples", items: [{ text: "sug**ar**" }, { text: "teach**er**" }, { text: "act**or**" }] },
    { kind: "paragraph", text: "One ends in **-ar**, one in **-er**, and one in **-or**. Sound alone cannot always tell you which spelling to choose." },
    { kind: "paragraph", text: "**Remember:** Your ears hear the sound; spelling patterns, relatives and memory help you choose the letters!" },
  ] },
];

const FINAL_ER_TIPS: readonly WeakVowelSecretTip[] = [
  { heading: "Detective Tip 1: Look for someone doing something!", blocks: [
    { kind: "paragraph", text: "One of the best clues for spelling **-er** is that it often means **a person or thing that does something**." },
    { kind: "paragraph", text: "Look what happens when we add **-er** to an action word:" },
    { kind: "examples", items: [
      { text: "teach + er = **teacher**", explanation: "someone who teaches" },
      { text: "help + er = **helper**", explanation: "someone who helps" },
      { text: "paint + er = **painter**", explanation: "someone who paints" },
      { text: "clean + er = **cleaner**", explanation: "someone or something that cleans" },
    ] },
    { kind: "paragraph", text: "**Detective question:** Can you find the action word hiding inside **teacher**?" },
    { kind: "paragraph", text: "If you can, that's a brilliant clue that the ending is spelt **-er**!" },
  ] },
  { heading: "Detective Tip 2: Look for comparisons!", blocks: [
    { kind: "paragraph", text: "We also use **-er** when comparing two things." },
    { kind: "examples", items: [
      { text: "tall → **taller**" }, { text: "small → **smaller**" },
      { text: "fast → **faster**" }, { text: "cold → **colder**" },
    ] },
    { kind: "paragraph", text: "Even though the ending sounds like “uh”, we write **-er**." },
    { kind: "paragraph", text: "**Memory trick:** When comparing two things, think **-er**!" },
  ] },
  { heading: "Detective Tip 3: Some words are just ER words!", blocks: [
    { kind: "paragraph", text: "Not every **-er** ending has a special meaning. Look at these words:" },
    { kind: "examples", items: [
      { text: "moth**er**" }, { text: "fath**er**" }, { text: "broth**er**" },
      { text: "wint**er**" }, { text: "butt**er**" }, { text: "pap**er**" },
    ] },
    { kind: "paragraph", text: "You cannot always break these words into an action and an ending." },
    { kind: "paragraph", text: "For these words, you need to **remember the spelling**. Try remembering groups together:" },
    { kind: "group", heading: "The family group:", words: ["mother", "father", "brother"] },
    { kind: "group", heading: "The everyday group:", words: ["water", "paper", "butter"] },
  ] },
  { heading: "Detective Tip 4: Don't trust your ears alone!", blocks: [
    { kind: "paragraph", text: "Listen to these three words:" },
    { kind: "examples", items: [{ text: "teach**er**" }, { text: "act**or**" }, { text: "sug**ar**" }] },
    { kind: "paragraph", text: "They all finish with the same quiet **“uh”** sound! But they have different spellings." },
    { kind: "paragraph", text: "Your ears can hear the schwa, but they cannot always tell you which letters to choose." },
    { kind: "paragraph", text: "That's why a spelling detective looks for **meaning, word patterns and clues**." },
  ] },
];

const FINAL_OR_TIPS: readonly WeakVowelSecretTip[] = [
  { heading: "Detective Tip 1: Look for someone doing something!", blocks: [
    { kind: "paragraph", text: "One of the best clues for spelling **-or** is that it sometimes means **a person who does something**." },
    { kind: "paragraph", text: "Look at these words:" },
    { kind: "examples", items: [
      { text: "act + or = **actor**", explanation: "someone who acts" },
      { text: "invent + or = **inventor**", explanation: "someone who invents" },
      { text: "visit + or = **visitor**", explanation: "someone who visits" },
      { text: "inspect + or = **inspector**", explanation: "someone who inspects" },
      { text: "direct + or = **director**", explanation: "someone who directs" },
    ] },
    { kind: "paragraph", text: "The ending **-or** can tell us who performs an action." },
    { kind: "paragraph", text: "But be careful! **-er** can do exactly the same job, as in **teacher** and **painter**." },
    { kind: "paragraph", text: "**Detective trick:** If a word names someone doing something, check whether it belongs to an **-or** spelling family." },
  ] },
  { heading: "Detective Tip 2: Look for the -ator family!", blocks: [
    { kind: "paragraph", text: "Some words share a special spelling pattern: **-ator**." },
    { kind: "examples", items: [
      { text: "cre**ator**" }, { text: "educ**ator**" }, { text: "narr**ator**" },
      { text: "illustr**ator**" }, { text: "calcul**ator**" },
    ] },
    { kind: "paragraph", text: "These words all end in **-ator**, with a weak **“uh”** sound at the very end." },
    { kind: "paragraph", text: "**Memory trick:** Spot the **-ator** pattern and remember that its final sound is spelt **-or**." },
  ] },
  { heading: "Detective Tip 3: Ask the word's relatives!", blocks: [
    { kind: "paragraph", text: "Sometimes a word's family helps you remember its ending. Look at these examples:" },
    { kind: "examples", items: [
      { text: "act → act**or** → act**or**s" },
      { text: "invent → invent**or** → invent**or**s" },
      { text: "inspect → inspect**or** → inspect**or**s" },
      { text: "direct → direct**or** → direct**or**s" },
    ] },
    { kind: "paragraph", text: "Even when we add more letters, the **or** spelling stays the same." },
    { kind: "paragraph", text: "Once you learn the spelling of a word, its relatives become easier to spell too!" },
  ] },
  { heading: "Detective Tip 4: Some words are just OR words!", blocks: [
    { kind: "paragraph", text: "Not every word ending in **-or** names someone doing something. Look at these words:" },
    { kind: "examples", items: [
      { text: "mirr**or**" }, { text: "horr**or**" }, { text: "terr**or**" },
      { text: "maj**or**" }, { text: "min**or**" },
    ] },
    { kind: "paragraph", text: "Col**or**? **No!** In British English, we spell this **colour**." },
    { kind: "paragraph", text: "These words need a little extra spelling memory." },
    { kind: "paragraph", text: "**Detective trick:** Remember the ending as a visual pattern, not just by listening to its sound." },
  ] },
];

const FINAL_AL_TIPS: readonly WeakVowelSecretTip[] = [
  { heading: "Detective Tip 1: Find the hidden A!", blocks: [
    { kind: "paragraph", text: "Look at **n a t u r a l**. In the clear three-syllable pronunciation, the last **a** has a weak /ə/ sound. In quicker speech, that ending may be even harder to hear." },
    { kind: "examples", items: [{ text: "natur**al** → NACH-uh-ruhl" }, { text: "actu**al** → AK-choo-uhl" }] },
    { kind: "paragraph", text: "**Detective trick:** A quiet ‘uhl’ ending has several possible spellings. In these words, remember **-al**." },
  ] },
  { heading: "Detective Tip 2: Look for the -ual pattern!", blocks: [
    { kind: "paragraph", text: "These words share the written **u-a-l** pattern:" },
    { kind: "examples", items: [{ text: "act**ual**" }, { text: "us**ual**" }, { text: "fact**ual**" }, { text: "rit**ual**" }] },
    { kind: "paragraph", text: "The **a** before **l** is weak, but it still belongs in the spelling. The **u** is another vowel: listen to the chosen word recording to hear how it is said." },
    { kind: "paragraph", text: "**Memory trick:** Picture the three-letter spelling pattern **U-A-L**." },
  ] },
  { heading: "Detective Tip 3: Ask the word's relatives!", blocks: [
    { kind: "paragraph", text: "Related words often keep the written **-al** or **-ual** pattern:" },
    { kind: "examples", items: [{ text: "natural → unnatural" }, { text: "actual → actually" }, { text: "usual → usually" }] },
    { kind: "paragraph", text: "**Detective trick:** If you know **actual**, its spelling helps you remember **actually**. A relative can preserve a spelling even when it does not make the vowel clearer." },
  ] },
  { heading: "Detective Tip 4: Keep the A when adding -ly!", blocks: [
    { kind: "paragraph", text: "Add **-ly** without dropping the **a** from **-al**:" },
    { kind: "examples", items: [{ text: "natural + ly → naturally" }, { text: "actual + ly → actually" }, { text: "usual + ly → usually" }] },
    { kind: "paragraph", text: "Some speakers compress these words in everyday speech. Use the reviewed recording when counting syllables in an activity; use your spelling voice to remember all the letters." },
  ] },
  { heading: "Detective Tip 5: Beware of the ‘uhl’ spelling trap!", blocks: [
    { kind: "paragraph", text: "The endings of **natural**, **camel** and **little** may sound similar, but they are written differently:" },
    { kind: "examples", items: [{ text: "natur**al** → -al" }, { text: "cam**el** → -el" }, { text: "litt**le** → -le" }] },
    { kind: "paragraph", text: "Your ears alone may not tell you which ending to choose. Look for **word families, familiar patterns and meaning**." },
  ] },
];

const FINAL_ET_TIPS: readonly WeakVowelSecretTip[] = [
  { heading: "Detective Tip 1 — Don't let the sound trick you!", blocks: [
    { kind: "examples", items: [{ text: "BAS-kit → basket, not baskit" }, { text: "JAK-it → jacket, not jackit" }, { text: "MAR-kit → market, not markit" }] },
    { kind: "paragraph", text: "**Detective trick:** The ending might sound like “it”, but it can be hiding an **e**!" },
  ] },
  { heading: "Detective Tip 2 — Watch out for real -it endings!", blocks: [
    { kind: "paragraph", text: "Not every ending that sounds like “it” is spelt **-et**." },
    { kind: "comparison", columns: ["Sounds like “it”", "Correct ending"], rows: [["rabbit", "-it"], ["habit", "-it"], ["basket", "-et"], ["jacket", "-et"]] },
    { kind: "paragraph", text: "You cannot always work out the spelling just by listening. You must learn which ending belongs to each word." },
  ] },
];

export function weakVowelTeaching(microSkillKey: WeakVowelMicroSkill, words: readonly WeakVowelLessonWordV1[]): TeachingPagesConfig {
  const copy = descriptions[microSkillKey];
  const finalA = microSkillKey === "D4_SCHWA_FINAL_A_FINAL";
  const finalET = microSkillKey === "D4_SCHWA_FINAL_ET";
  const finalAR = microSkillKey === "D4_SCHWA_FINAL_AR_FINAL";
  const finalER = microSkillKey === "D4_SCHWA_FINAL_ER_FINAL";
  const finalOR = microSkillKey === "D4_SCHWA_FINAL_OR_FINAL";
  const initialA = microSkillKey === "D4_SCHWA_INITIAL_A_INITIAL";
  const initialE = microSkillKey === "D4_SCHWA_INITIAL_E_INITIAL";
  const initialO = microSkillKey === "D4_SCHWA_INITIAL_O_INITIAL";
  const medialWeak = microSkillKey === "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS";
  const naturalActual = microSkillKey === "D4_SCHWA_FINAL_AL";
  return {
    pages: [
      { id: "secret-life-intro-v2", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "The disappearing vowel", paragraphs: ["Today we are looking at why unstressed vowels can seem to disappear in multisyllabic words."],
        weakVowelFeature: { kind: "sound_contrast", stress: ["They are usually said more strongly and with more energy.", "They are usually lighter and less energetic, so their spelling can be hard to hear."],
          fact: "The schwa /ə/ is sometimes called the ‘murmur vowel’ or the ‘lazy sound’. It is one kind of unstressed vowel. A, E, I, O and U can all spell it.",
          schwaExamples: ["desperate · des-per-ate", "dictionary · dic-tion-ar-y"],
          otherExamples: ["imagine · /ɪ/ at the start", "village · /ɪ/ in the last syllable", "A weak vowel can sound closer to ‘ah’ in some accents; follow the recording."],
          vowelReminder: "A E I O U — and sometimes Y — can be vowel letters." } },
      finalA ? { id: "secret-life-final-a-groups-v2", type: "teaching", eyebrow: "Quiet final a", title: "Two groups of -a nouns", paragraphs: ["Many familiar nouns end with a written a and a weak final ‘uh’ /ə/ sound. Grouping words can help you remember them."],
        weakVowelFeature: { kind: "final_a_groups", groups: [
          { heading: "Places, ideas and everyday things", words: ["sofa", "banana", "soda", "arena", "villa", "umbrella", "camera", "replica", "gorilla", "comma", "algebra"] },
          { heading: "Names and geography", words: ["America", "Canada", "China", "Africa", "Jessica", "Anna", "Maria"] },
        ], note: "These are examples to notice, not a rule for every noun. Listen, then check the whole spelling." } }
        : finalET ? { id: "secret-life-final-et-story-v2", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "The Secret of the Quiet -et", subtitle: "When the ending looks like -et but sounds like “it”!", paragraphs: [],
          weakVowelFeature: { kind: "final_et_story", intro: [
              "Remember how vowels can become weaker when they are not in the strongest syllable of a word?",
              "Sometimes a word ends with **-et**, but when we say it naturally, the ending sounds more like “it”.",
              "Look at these words. Say them aloud and compare how they sound with how they are spelt.",
            ], examples: [
              { word: "basket", sound: "BAS-kit", spelling: "bask-et" },
              { word: "jacket", sound: "JAK-it", spelling: "jack-et" },
              { word: "market", sound: "MAR-kit", spelling: "mark-et" },
              { word: "rocket", sound: "ROK-it", spelling: "rock-et" },
              { word: "ticket", sound: "TIK-it", spelling: "tick-et" },
              { word: "target", sound: "TAR-git", spelling: "targ-et" },
            ], conclusion: ["Your ears might tell you to write **-it**, but these words are actually spelt with **-et**!", "The **e** has a weak vowel sound. It doesn't sound like the clear short **e** in **bed**."], tips: FINAL_ET_TIPS } }
        : finalAR ? { id: "secret-life-final-ar-story-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "The Secret of the Lazy -ar", subtitle: "When AR sounds like ‘uh’!", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_story", intro: [
            "You already know that **ar** can make a strong sound, as in **car**, **star** and **park**.",
            "But at the end of some British English words, **-ar** becomes quiet and makes the **schwa /ə/** sound, like ‘uh’.",
          ], examples: [
            { stem: "sug", ending: "ar", sound: "SHU-guh" },
            { stem: "doll", ending: "ar", sound: "DOL-uh" },
            { stem: "calend", ending: "ar", sound: "KAL-uhn-duh" },
            { stem: "gramm", ending: "ar", sound: "GRAM-uh" },
          ], conclusion: "The final **-ar** is unstressed in these examples. It sounds quiet, but we still spell both letters.", tips: FINAL_AR_TIPS } }
        : finalER ? { id: "secret-life-final-er-story-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "The Secret of the Lazy -er", subtitle: "When ER sounds like “uh”!", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_story", intro: [
            "You already know that **er** can make a sound like in **her** and **term**.",
            "But did you know that **-er** has a secret?",
            "In British English, when **-er** appears at the end of many words, it becomes lazy!",
            "Instead of making a strong sound, it makes a soft **“uh”** sound called the **schwa** /ə/.",
          ], examples: [
            { stem: "teach", ending: "er", sound: "TEE-chuh" }, { stem: "moth", ending: "er", sound: "MUTH-uh" },
            { stem: "wint", ending: "er", sound: "WIN-tuh" }, { stem: "pap", ending: "er", sound: "PAY-puh" },
            { stem: "butt", ending: "er", sound: "BUT-uh" }, { stem: "wat", ending: "er", sound: "WAW-tuh" },
          ], conclusion: "Notice something? Even though we write **er**, we hear **“uh”** at the end!", tips: FINAL_ER_TIPS } }
        : finalOR ? { id: "secret-life-final-or-story-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "The Secret of the Lazy -or", subtitle: "When OR sounds like “uh”!", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_story", intro: [
            "You already know that **or** can make a strong sound, like in **fork**, **storm** and **short**.",
            "But did you know that **-or** has a secret?",
            "In British English, when **-or** appears at the end of some words, it becomes lazy!",
            "Instead of making its usual strong sound, it makes a quiet **“uh”** sound called the **schwa** /ə/.",
          ], examples: [
            { stem: "act", ending: "or", sound: "AK-tuh" }, { stem: "doct", ending: "or", sound: "DOK-tuh" },
            { stem: "visit", ending: "or", sound: "VIZ-i-tuh" }, { stem: "invent", ending: "or", sound: "in-VEN-tuh" },
            { stem: "mirr", ending: "or", sound: "MIR-uh" }, { stem: "horr", ending: "or", sound: "HOR-uh" },
          ], conclusion: "Notice something? Even though we write **or**, we hear **“uh”** at the end!", tips: FINAL_OR_TIPS } }
        : initialA ? { id: "secret-life-initial-a-story-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "The Quiet First A", subtitle: "The a is written even when it sounds weak", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_story", targetPosition: "initial", intro: [
            "Some familiar words begin with a quiet **a**. Another syllable gets the strong beat.",
            "Listen to the complete word, then compare its sound with the first written letter.",
          ], examples: [
            { stem: "bout", ending: "a", sound: "uh-BOUT" }, { stem: "round", ending: "a", sound: "uh-ROUND" },
            { stem: "way", ending: "a", sound: "uh-WAY" }, { stem: "gain", ending: "a", sound: "uh-GEN" },
          ], conclusion: "The quiet first vowel is written **a** in these words. Follow the chosen pronunciation for each word; pronunciation can vary.", tips: INITIAL_A_TIPS } }
        : initialE ? { id: "secret-life-initial-e-story-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "The Secret of the Lazy e-", subtitle: "When initial E sounds quiet!", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_story", targetPosition: "initial", intro: [
            "You already know that **e** can make different sounds, as in **egg**, **me** and **even**.",
            "But did you know that **e** has a secret? At the beginning of some words, it can become weak.",
            "In these common British pronunciations, the first **e** sounds like a short **“ih”** /ɪ/. Another syllable gets the strong beat.",
          ], examples: [
            { stem: "vent", ending: "e", sound: "ih-VENT" }, { stem: "ffect", ending: "e", sound: "ih-FEKT" },
            { stem: "scape", ending: "e", sound: "ih-SKAYP" }, { stem: "nough", ending: "e", sound: "ih-NUF" },
            { stem: "leven", ending: "e", sound: "ih-LEV-un" }, { stem: "motion", ending: "e", sound: "ih-MOH-shun" },
            { stem: "lectric", ending: "e", sound: "ih-LEK-trik" },
          ], conclusion: "Notice something? The first **e** is quiet while another syllable sounds stronger. A weak vowel is not always the schwa /ə/; these British examples commonly start with /ɪ/.", tips: INITIAL_E_TIPS } }
        : initialO ? { id: "secret-life-initial-o-story-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "The Secret of the Lazy o-", subtitle: "When O sounds like “uh”!", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_story", targetPosition: "initial", intro: [
            "You already know that **o** can make different sounds, as in **orange**, **open** and **hot**.",
            "But did you know that **o** has a secret? At the beginning of some words, it can become quiet.",
            "When the first syllable is unstressed, its **o** can sound like a soft **“uh”** called the **schwa** /ə/.",
          ], examples: [
            { stem: "ccasion", ending: "o", sound: "uh-KAY-zhun" },
            { stem: "ppose", ending: "o", sound: "uh-POHZ" },
            { stem: "fficial", ending: "o", sound: "uh-FISH-ul" },
            { stem: "bserve", ending: "o", sound: "uhb-ZURV" },
            { stem: "ccur", ending: "o", sound: "uh-KUR" },
          ], conclusion: "Notice something? The first **o** is weak while another syllable gets the strong beat. **Observation** is a useful relative, but its first **o** has a different sound in common British pronunciation.", tips: INITIAL_O_TIPS } }
        : medialWeak ? { id: "secret-life-medial-weak-story-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "The Mystery of the Disappearing Middle Vowel", subtitle: "When a vowel hides in the middle of a word!", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_story", targetPosition: "medial", intro: [
            "Some words have written **vowels** that are hard to hear in the middle.",
            "An unstressed vowel may sound weak. In some pronunciations, its separate sound disappears when syllables are compressed.",
            "Even when the sound fades, **the vowel letter stays in the spelling**. Listen to these everyday British examples. Pronunciations can vary; in the activities, follow the chosen recording.",
          ], examples: [
            { stem: "fam", ending: "i", suffix: "ly", sound: "FAM-uh-lee / FAM-lee" },
            { stem: "bus", ending: "i", suffix: "ness", sound: "BIZ-niss" },
            { stem: "diff", ending: "e", suffix: "rent", sound: "DIF-uh-runt" },
            { stem: "ev", ending: "e", suffix: "ry", sound: "EV-ree" },
            { stem: "cam", ending: "e", suffix: "ra", sound: "KAM-ruh" },
            { stem: "choc", ending: "o", suffix: "late", sound: "CHOK-lut" },
          ], conclusion: "Can you spot the hard-to-hear written vowels? The reviewed **different** recording for these lessons has three syllables. A two-syllable form from another speaker is a variation.", tips: MEDIAL_WEAK_TIPS } }
        : naturalActual ? { id: "secret-life-natural-actual-story-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "The Secret of the Lazy -al", subtitle: "When the ending -al sounds like ‘uhl’!", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_story", intro: [
            "You already know that vowels can become weak when they do not receive the strong beat in a word.",
            "Some words hide a quiet **a** before **l** in **-al**. In the pronunciations shown here, it makes the weak **schwa /ə/** sound followed by **l**.",
            "Listen to these words in British English. The exact syllables can vary by speaker; follow the chosen recording in each activity.",
          ], examples: [
            { stem: "natur", ending: "al", sound: "NACH-uh-ruhl" },
            { stem: "actu", ending: "al", sound: "AK-choo-uhl" },
            { stem: "usu", ending: "al", sound: "YOO-zhoo-uhl" },
          ], conclusion: "Notice the **a** near the end. It does not make its strong letter sound; in these examples it sounds like /ə/ before **l**. In today's activity words, follow the highlighted reviewed **a** and its recording.", tips: FINAL_AL_TIPS } }
        : { id: "secret-life-fallback-v2", type: "teaching", eyebrow: "Today's mission", title: copy.name, paragraphs: [copy.focus, "Call It to Dinner finds the syllables and quiet spelling. Vowel Detective lets you investigate a word family when one is available."], callout: copy.strategy },
      finalA ? { id: "secret-life-final-a-strategy-v2", type: "teaching", eyebrow: "How to remember", title: "Look for a spelling clue", paragraphs: ["When a noun ends in a weak ‘uh’ sound, ask what the word means. Then check its spelling."],
        weakVowelFeature: { kind: "final_a_strategy", choices: [
          { heading: "A person who does a job?", explanation: "The suffix -er often names someone who does an action.", example: "teach → teacher · print → printer" },
          { heading: "An object, idea or name?", explanation: "Many nouns of this kind finish with a written a.", example: "sofa · agenda · opera" },
        ], note: "This is a clue, not a test that always works: doctor and actor end in -or. Learn the whole word you hear." } }
        : finalET ? { id: "secret-life-final-et-rule-v2", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "The Disguised E!", subtitle: "The E is pretending to be I!", paragraphs: [],
          weakVowelFeature: { kind: "final_et_rule", intro: [
              "Sometimes, the letter **E** puts on an **I** disguise!",
              "When we say words like **basket**, **jacket** and **rocket**, the ending sounds like “it”.",
              "But underneath that sound, there's a hidden **E** in the spelling.",
              "Picture this: A cheeky letter **E** wearing an **I** costume, with the real **E** peeking out underneath.",
            ], examples: [
              { word: "basket", sound: "BAS-kit" }, { word: "jacket", sound: "JAK-it" },
              { word: "rocket", sound: "ROK-it" }, { word: "market", sound: "MAR-kit" },
              { word: "ticket", sound: "TIK-it" }, { word: "target", sound: "TAR-git" },
            ], rule: ["Some words sound like they end in “it”, but they are spelt with **-et**.", "The letter **E** is only pretending to sound like **I**!"],
            motto: "“Sounds like IT? Don't forget, E might be hiding in ET!”" } }
        : finalAR ? { id: "secret-life-final-ar-rule-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "Today's Secret Rule", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_rule", rule: "At the end of some British English words, **-ar** makes the weak **‘uh’** sound **/ə/**.",
            clues: ["**Spot -ular!** Remember the spelling **u-l-a-r**.", "**Check -ilar and -iliar!** Similar and familiar have different spellings.", "**Explore relatives!** A related word may make the vowel clearer.", "**Practise tricky words!** Some endings need whole-word memory."],
            conclusion: "Sound alone cannot always distinguish **-ar**, **-er** and **-or**. Check the whole word and its spelling clues.",
            motto: "Hear the ‘uh’, spot the pattern, remember the AR!", tips: FINAL_AR_TIPS } }
        : finalER ? { id: "secret-life-final-er-rule-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "Today's Secret Rule", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_rule", rule: "At the end of many British English words, **-er** makes the weak **“uh”** sound **/ə/**.",
            clues: ["**Someone doing something?** Look for **-er**.", "**Comparing two things?** Look for **-er**."],
            conclusion: "For other words, become a spelling detective and remember which ending belongs to each word!",
            motto: "Hear the “uh”, investigate the word, remember the ER!", tips: FINAL_ER_TIPS } }
        : finalOR ? { id: "secret-life-final-or-rule-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "Today's Secret Rule", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_rule", rule: "At the end of many British English words, **-or** makes the weak **“uh”** sound **/ə/**.",
            clues: ["**Someone doing something?** The ending might be **-or**.", "**Spot an -ator word?** Remember that it finishes with **-or**.", "**Know a word's relatives?** Look for the spelling that stays the same."],
            conclusion: "Look for the written pattern as well as the sound.",
            motto: "Hear the “uh”, investigate the word, remember the OR!", tips: FINAL_OR_TIPS } }
        : initialA ? { id: "secret-life-initial-a-rule-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "Today's Secret Rule", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_rule", rule: "In some words, the first written **a** is unstressed and sounds weak. Keep the **a** when you spell the whole word.",
            clues: ["**Find the strong beat!** The first syllable may be quiet.", "**Look at the first letter!** Sound alone may not tell you which vowel to write.", "**Remember the whole word!** Say it, look, cover and spell."],
            conclusion: "The weak sound can vary by word and speaker. Use the reviewed recording and remember its written **a**.",
            motto: "Hear the quiet start, remember the A!", tips: INITIAL_A_TIPS } }
        : initialE ? { id: "secret-life-initial-e-rule-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "Today's Secret Rule", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_rule", rule: "At the beginning of many British English words, an unstressed **e** is weak. In today's examples it commonly sounds like short **“ih”** **/ɪ/**, not schwa **/ə/**.",
            clues: ["**Find the strong beat!** The first syllable may be quiet.", "**Look for word families!** Related words can help you remember the spelling.", "**Watch out for short /ɪ/!** Not every weak initial **e** is a schwa."],
            conclusion: "Follow the chosen word recording and use spelling clues when the quiet vowel is hard to hear.",
            motto: "Hear the weak vowel, find the strong beat, remember the E!", tips: INITIAL_E_TIPS } }
        : initialO ? { id: "secret-life-initial-o-rule-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "Today's Secret Rule", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_rule", rule: "At the beginning of some British English words, an unstressed **o** makes the weak **“uh”** sound **/ə/**.",
            clues: ["**Find the strong beat!** The first syllable may have a quiet vowel.", "**Look for double consonants!** Some words have **cc**, **pp** or **ff** after the first **o**.", "**Investigate the word family!** Related words can help you remember the spelling."],
            conclusion: "A relative can keep the same written **o** even when its pronunciation changes; listen to each word on its own.",
            motto: "Hear the “uh”, find the spelling clues, remember the O!", tips: INITIAL_O_TIPS } }
        : medialWeak ? { id: "secret-life-medial-weak-rule-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "Today's Secret Rule", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_rule", rule: "An unstressed middle vowel can sound weak, become a **schwa /ə/**, or lose its separate sound in a compressed pronunciation. **Keep its letter in the spelling.**",
            clues: ["**Find the strong beat!** Investigate the quieter parts of the recorded word.", "**Use your spelling voice!** Say the hidden letters clearly as a memory aid.", "**Check every vowel!** A hard-to-hear sound can still have a written letter."],
            conclusion: "Listen to the chosen recording for its syllables; use the written word to remember every letter.",
            motto: "Sounds may fade away, but the letters are here to stay!", tips: MEDIAL_WEAK_TIPS } }
        : naturalActual ? { id: "secret-life-natural-actual-rule-v1", type: "teaching", eyebrow: "The Secret Life of Vowels", title: "Today's Secret Rule", paragraphs: [],
          weakVowelFeature: { kind: "ending_secret_rule", rule: "In words such as **natural** and **actual**, an unstressed **a** before **l** in **-al** makes a weak sound. Keep that spelling when **-ly** follows.",
            clues: ["**Look for -ual!** Actual, usual and factual share a spelling pattern.", "**Investigate word families!** The **-al** stays in actual → actually.", "**Keep the A!** The letter belongs in the spelling even when it is hard to hear."],
            conclusion: "A word can have more than one weak vowel. In today's selected words, check the highlighted **a** in **-al** and its reviewed recording.",
            motto: "Hear the ‘uhl’, look for the family, remember the AL!", tips: FINAL_AL_TIPS } }
        : { id: "secret-life-strategies-v2", type: "teaching", eyebrow: "How to remember", title: "Look, cover, spell, check", paragraphs: ["Study the complete word and its quiet letters. A word family may preserve the spelling even if the vowel stays hard to hear.", "Then cover the word, spell it from memory and write the whole sentence you hear."], callout: "A clue helps you investigate. Your own spelling attempt shows what you remember." },
    ],
    meetWords: { title: "Meet today's words", introduction: "These words were selected for you. Notice the quiet spelling and what each word means.", presentation: "combined", words: words.map((word) => ({ id: word.canonicalWordId, word: word.spelling, detail: word.definition.text, highlightStart: word.dinner.target.start, highlightLength: word.dinner.target.end - word.dinner.target.start, provenance: word.provenance === "learning_item" ? "Your word to practise" : word.provenance === "probe_miss" ? "From your listening check" : "A new stretch word" })) },
  };
}

const sha = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function validateWeakVowelLesson(value: unknown, allowFixture = false): value is WeakVowelLessonV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const lesson = value as WeakVowelLessonV1;
  if (lesson.schemaVersion !== 1 || lesson.routeKey !== "weak_vowel_word_lab" ||
    !WEAK_VOWEL_MICRO_SKILLS.includes(lesson.microSkillKey) || typeof lesson.assignmentKey !== "string" || !lesson.assignmentKey ||
    typeof lesson.contentVersion !== "string" || !lesson.contentVersion ||
    !(lesson.authority === "governed_release" || allowFixture && lesson.authority === "dev_fixture") ||
    !Array.isArray(lesson.words) || lesson.words.length < (allowFixture ? 1 : 4) || lesson.words.length > 6 ||
    typeof lesson.reflectionPrompt !== "string" || !lesson.reflectionPrompt.trim() ||
    !lesson.teaching || !Array.isArray(lesson.teaching.pages) ||
    !lesson.teaching.meetWords || !Array.isArray(lesson.teaching.meetWords.words) ||
    lesson.teaching.meetWords.words.length !== lesson.words.length) return false;
  const ids = new Set<string>();
  const sentences = new Set<string>();
  for (const [index, word] of lesson.words.entries()) {
    if (!word || typeof word !== "object" || typeof word.canonicalWordId !== "string" ||
      typeof word.spelling !== "string" || ids.has(word.canonicalWordId) ||
      !["learning_item", "probe_miss", "stretch"].includes(word.provenance) ||
      !word.definition || typeof word.definition.text !== "string" || !word.definition.text.trim() ||
      !sha(word.definition.sourceFingerprint) ||
      !(word.routeContentSha256 === undefined || sha(word.routeContentSha256)) ||
      !(word.definition.reviewStatus === "approved" || allowFixture && word.definition.reviewStatus === "candidate") ||
      !word.dinner || !word.dinner.target || !word.dictation ||
      typeof word.dictation !== "object" || !word.dictation.recording) return false;
    ids.add(word.canonicalWordId);
    const introduced = lesson.teaching.meetWords.words[index];
    if (!introduced || introduced.id !== word.canonicalWordId || introduced.word !== word.spelling ||
      introduced.detail !== word.definition.text ||
      introduced.highlightStart !== word.dinner.target.start ||
      introduced.highlightLength !== word.dinner.target.end - word.dinner.target.start) return false;
    if (typeof word.dictation.sentence !== "string") return false;
    const sentenceKey = word.dictation.sentence.trim().toLocaleLowerCase("en-GB");
    if (sentences.has(sentenceKey)) return false;
    sentences.add(sentenceKey);
    const dinner = parseDinnerRound(word.dinner, allowFixture);
    const detective = parseDetectiveRound(word.detective, allowFixture);
    if (!dinner || !detective || word.canonicalWordId !== dinner.canonicalWordId || word.canonicalWordId !== detective.canonicalWordId ||
      word.spelling !== dinner.spelling || word.spelling !== detective.spelling ||
      dinner.microSkillKey !== lesson.microSkillKey || detective.microSkillKey !== lesson.microSkillKey ||
      dinner.wordSense !== detective.wordSense ||
      dinner.pronunciationId !== detective.pronunciationId || dinner.sourceFingerprint !== detective.sourceFingerprint ||
      dinner.recording.sha256 !== detective.recording.sha256 || dinner.target.start !== detective.target.start ||
      dinner.target.end !== detective.target.end || dinner.target.text !== detective.target.text ||
      !word.dictation.sentence || typeof word.dictation.recording.src !== "string" ||
      !isWeakVowelAudioSource(word.dictation.recording.src) ||
      word.dictation.recording.reviewStatus !== "approved" || !sha(word.dictation.recording.sha256) ||
      !Number.isInteger(word.dictation.targetStart) || !Number.isInteger(word.dictation.targetEnd) ||
      word.dictation.targetStart < 0 || word.dictation.targetEnd <= word.dictation.targetStart ||
      word.dictation.sentence.slice(word.dictation.targetStart, word.dictation.targetEnd).toLocaleLowerCase("en-GB") !== word.spelling.toLocaleLowerCase("en-GB")) return false;
  }
  return true;
}
