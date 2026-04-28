"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const detectMisspellings_1 = require("./lib/spelling/detectMisspellings");
const suggestCorrection_1 = require("./lib/spelling/suggestCorrection");
const lexicon_1 = require("./lib/spelling/lexicon");
const text = `Intro

Hi, my name is Scarlett and I am 8 years old. You might be wondering what my new hobby is, it is cooking. I am reading a cooking book and I am going to teach you about what I learnt in the book. There will be some recipes. Lets go.

Salt

Salt gives texture to food it can make it sweet to. I am not talking about table salt I mean anything but table salt. Do not put it on at the end put it on in the middle. If you do not like fat that is because salt sinks in it slower. Here is the first recipe.

Ingrediance

Salt.

Mince beef.

Rice.

Tamato passata.

Harrisa.

Garlic`;
for (const word of ['ingrediance', 'tamato', 'harrisa', 'lets', 'to']) {
    console.log(word, {
        known: (0, suggestCorrection_1.isKnownWord)(word),
        knownLike: (0, lexicon_1.isKnownWordLike)(word),
        suggestion: (0, suggestCorrection_1.suggestCorrection)(word),
    });
}
console.log('detected', (0, detectMisspellings_1.detectMisspellings)(text).map((x) => ({
    misspelling: x.misspelling,
    correction: x.correction,
    confidence: x.confidence,
    category: x.category,
    diagnosis: x.errorPattern,
})));
