"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORD_FAMILIES = void 0;
exports.getHomophoneWordsForFamily = getHomophoneWordsForFamily;
exports.findHomophoneSetFamilyForWord = findHomophoneSetFamilyForWord;
exports.findHomophoneSetFamilyForWords = findHomophoneSetFamilyForWords;
exports.findHomophoneGroupFamilyForWord = findHomophoneGroupFamilyForWord;
exports.getRelatedHomophoneGroupFamilyId = getRelatedHomophoneGroupFamilyId;
exports.isWordFamilyId = isWordFamilyId;
exports.normaliseWordFamilyId = normaliseWordFamilyId;
exports.asWordFamilyId = asWordFamilyId;
exports.getWordFamilyById = getWordFamilyById;
exports.matchesWordFamily = matchesWordFamily;
exports.findWordFamilyForWord = findWordFamilyForWord;
const HOMOPHONE_SET_WORDS = {
    homophone_there_their_theyre: ["there", "their", "they're"],
    homophone_to_too_two: ["to", "too", "two"],
    homophone_weather_whether: ["weather", "whether"],
    homophone_whose_whos: ["whose", "who's"],
};
const HOMOPHONE_GROUP_WORDS = {
    homophones_year_2: ["there", "their", "they're", "to", "too", "two"],
    homophones_year_3_4: ["weather", "whether", "whose", "who's"],
};
const HOMOPHONE_GROUP_BY_SET = {
    homophone_there_their_theyre: "homophones_year_2",
    homophone_to_too_two: "homophones_year_2",
    homophone_weather_whether: "homophones_year_3_4",
    homophone_whose_whos: "homophones_year_3_4",
};
const LEGACY_FAMILY_ID_MAP = {
    "tricky-words": "tricky_common_words",
    "double-letters": "double_letters",
    "split-digraphs": "silent_e_words",
};
exports.WORD_FAMILIES = [
    {
        id: "homophone_there_their_theyre",
        label: "there / their / they're",
        description: "Meaning-choice words that sound the same but mean different things.",
        graphemes: [],
        practiceWords: ["there", "their", "they're"],
    },
    {
        id: "homophone_to_too_two",
        label: "to / too / two",
        description: "Meaning-choice words that sound the same but mean different things.",
        graphemes: [],
        practiceWords: ["to", "too", "two"],
    },
    {
        id: "homophone_weather_whether",
        label: "weather / whether",
        description: "Meaning-choice words that sound the same but mean different things.",
        graphemes: [],
        practiceWords: ["weather", "whether"],
    },
    {
        id: "homophone_whose_whos",
        label: "whose / who's",
        description: "Meaning-choice words that sound the same but mean different things.",
        graphemes: [],
        practiceWords: ["whose", "who's"],
    },
    {
        id: "homophones_year_2",
        label: "Year 2 homophones",
        description: "Common Year 2 homophones taught through meaning and sentence choice.",
        graphemes: [],
        practiceWords: ["there", "their", "they're", "to", "too", "two"],
    },
    {
        id: "homophones_year_3_4",
        label: "Year 3/4 homophones",
        description: "Common Year 3/4 homophones taught through meaning and sentence choice.",
        graphemes: [],
        practiceWords: ["weather", "whether", "whose", "who's"],
    },
    {
        id: "ai-ay",
        label: "ai / ay",
        description: "Long a spellings in the middle and at the end of words.",
        graphemes: ["ai", "ay"],
        practiceWords: ["rain", "train", "trail", "play", "stay", "spray"],
    },
    {
        id: "ee-ea",
        label: "ee / ea",
        description: "Long e spellings in common British English words.",
        graphemes: ["ee", "ea"],
        practiceWords: ["seed", "green", "clean", "dream", "please", "teacher"],
    },
    {
        id: "igh-ie-y",
        label: "igh / ie / y",
        description: "Long i patterns across simple roots.",
        graphemes: ["igh", "ie", "y"],
        practiceWords: ["light", "night", "pie", "tie", "cry", "fly"],
    },
    {
        id: "oa-ow-oe",
        label: "oa / ow / oe",
        description: "Long o spellings with middle and end patterns.",
        graphemes: ["oa", "ow", "oe"],
        practiceWords: ["boat", "road", "snow", "grow", "toe", "goes"],
    },
    {
        id: "ow-ou",
        label: "ow / ou",
        description: "Ow and ou vowel spellings that often get confused.",
        graphemes: ["ow", "ou"],
        practiceWords: ["cloud", "sound", "round", "brown", "shout", "found"],
    },
    {
        id: "ar-or",
        label: "ar / or",
        description: "R-influenced vowels that matter in spelling choices.",
        graphemes: ["ar", "or"],
        practiceWords: ["park", "star", "storm", "short", "garden", "morning"],
    },
    {
        id: "er-ir-ur",
        label: "er / ir / ur",
        description: "Alternative spellings for the same schwa-r sound.",
        graphemes: ["er", "ir", "ur"],
        practiceWords: ["her", "bird", "turn", "thirty", "purple", "winter"],
    },
    {
        id: "double-letters",
        label: "Double letters",
        description: "Words that need a doubled consonant such as ll, tt or pp.",
        graphemes: ["ll", "tt", "pp", "ss"],
        practiceWords: ["really", "little", "running", "rabbit", "summer", "happy"],
    },
    {
        id: "split-digraphs",
        label: "Split digraphs",
        description: "a_e, i_e, o_e and u_e long vowel patterns.",
        graphemes: ["a_e", "i_e", "o_e", "u_e"],
        practiceWords: ["make", "slide", "home", "cute", "invite", "inside"],
    },
    {
        id: "suffixes",
        label: "Common suffixes",
        description: "Inflectional and derivational endings such as -ed and -ing.",
        graphemes: ["ed", "ing", "er", "est", "ly", "tion"],
        practiceWords: ["jumped", "jumping", "happiest", "runner", "careful", "slowly"],
    },
    {
        id: "tricky-words",
        label: "Tricky memory words",
        description: "High-frequency words that rely on memory more than sound.",
        graphemes: [],
        practiceWords: ["because", "friend", "people", "should", "could", "would"],
    },
    {
        id: "silent_e_words",
        label: "Silent e words",
        description: "Words where a final e changes the vowel sound.",
        graphemes: ["a_e", "i_e", "o_e", "u_e"],
        practiceWords: ["make", "these", "time", "home", "cute", "hope"],
    },
    {
        id: "double_letters",
        label: "Double letters",
        description: "Words that need a doubled consonant inside the word.",
        graphemes: ["ll", "tt", "pp", "ss", "nn"],
        practiceWords: ["really", "little", "happy", "running", "rabbit", "dinner"],
    },
    {
        id: "ck_pattern",
        label: "ck pattern",
        description: "Short vowel words that use ck after the vowel sound.",
        graphemes: ["ck"],
        practiceWords: ["back", "duck", "kick", "rock", "stuck", "pocket"],
    },
    {
        id: "schwa_unstressed_vowel",
        label: "Schwa unstressed vowel",
        description: "Words where an unstressed vowel is hard to hear clearly.",
        graphemes: ["a", "e", "i", "o", "u"],
        practiceWords: ["about", "support", "pencil", "animal", "family", "chicken"],
    },
    {
        id: "ie_ei_patterns",
        label: "ie / ei patterns",
        description: "Alternative spellings that often cause memory confusion.",
        graphemes: ["ie", "ei"],
        practiceWords: ["field", "piece", "chief", "believe", "receipt", "ceiling"],
    },
    {
        id: "tricky_common_words",
        label: "Tricky common words",
        description: "High-frequency words that are best learned through repeated exposure.",
        graphemes: [],
        practiceWords: ["because", "people", "friend", "their", "could", "again"],
    },
    {
        id: "soft_c",
        label: "Soft c",
        description: "c making an s sound before e, i or y.",
        graphemes: ["ce", "ci", "cy"],
        practiceWords: ["city", "cent", "circle", "fancy", "pencil", "ice"],
    },
    {
        id: "soft_g",
        label: "Soft g",
        description: "g making a j sound before e, i or y.",
        graphemes: ["ge", "gi", "gy"],
        practiceWords: ["giant", "giraffe", "page", "magic", "energy", "ginger"],
    },
    {
        id: "drop_final_e_ing",
        label: "Drop final e before -ing",
        description: "Words that drop a final e before adding ing.",
        graphemes: ["e + ing"],
        practiceWords: ["making", "hiding", "baking", "riding", "hoping", "shining"],
    },
    {
        id: "change_y_to_i",
        label: "Change y to i",
        description: "Words that change y to i before certain endings.",
        graphemes: ["y -> i"],
        practiceWords: ["tried", "tries", "happier", "happiest", "carried", "families"],
    },
    {
        id: "double_consonant_suffix",
        label: "Double consonant before suffix",
        description: "Short vowel words that double the consonant before adding a suffix.",
        graphemes: ["bb", "dd", "gg", "ll", "mm", "nn", "pp", "tt"],
        practiceWords: ["running", "hopping", "sadder", "biggest", "dropped", "planned"],
    },
    {
        id: "no_double_consonant",
        label: "No double consonant",
        description: "Longer vowel or two-consonant words that do not double before the suffix.",
        graphemes: ["ing", "ed", "er"],
        practiceWords: ["visiting", "opening", "boating", "painted", "waiting", "helping"],
    },
];
function normaliseHomophoneWord(word) {
    return word.trim().toLowerCase().replace(/['’]/g, "");
}
function getHomophoneWordsForFamily(familyId) {
    const setWords = familyId in HOMOPHONE_SET_WORDS
        ? HOMOPHONE_SET_WORDS[familyId]
        : [];
    const groupWords = familyId in HOMOPHONE_GROUP_WORDS
        ? HOMOPHONE_GROUP_WORDS[familyId]
        : [];
    return [
        ...setWords,
        ...groupWords,
    ];
}
function findHomophoneSetFamilyForWord(word) {
    const normalisedWord = normaliseHomophoneWord(word);
    const setFamilyId = Object.entries(HOMOPHONE_SET_WORDS).find(([, words]) => words.map(normaliseHomophoneWord).includes(normalisedWord))?.[0];
    return setFamilyId ? getWordFamilyById(setFamilyId) : undefined;
}
function findHomophoneSetFamilyForWords(leftWord, rightWord) {
    const normalisedLeft = normaliseHomophoneWord(leftWord);
    const normalisedRight = normaliseHomophoneWord(rightWord);
    const setFamilyId = Object.entries(HOMOPHONE_SET_WORDS).find(([, words]) => {
        const normalisedWords = words.map(normaliseHomophoneWord);
        return (normalisedWords.includes(normalisedLeft) &&
            normalisedWords.includes(normalisedRight));
    })?.[0];
    return setFamilyId ? getWordFamilyById(setFamilyId) : undefined;
}
function findHomophoneGroupFamilyForWord(word) {
    const normalisedWord = normaliseHomophoneWord(word);
    const groupFamilyId = Object.entries(HOMOPHONE_GROUP_WORDS).find(([, words]) => words.map(normaliseHomophoneWord).includes(normalisedWord))?.[0];
    return groupFamilyId ? getWordFamilyById(groupFamilyId) : undefined;
}
function getRelatedHomophoneGroupFamilyId(familyId) {
    if (!familyId) {
        return null;
    }
    if (familyId in HOMOPHONE_GROUP_WORDS) {
        return familyId;
    }
    return HOMOPHONE_GROUP_BY_SET[familyId] ?? null;
}
function isWordFamilyId(value) {
    return exports.WORD_FAMILIES.some((family) => family.id === value);
}
function normaliseWordFamilyId(value) {
    if (!value) {
        return null;
    }
    const trimmedValue = value.trim();
    if (!trimmedValue) {
        return null;
    }
    return LEGACY_FAMILY_ID_MAP[trimmedValue] ?? trimmedValue;
}
function asWordFamilyId(value) {
    const normalisedValue = normaliseWordFamilyId(value);
    if (!normalisedValue) {
        return null;
    }
    return isWordFamilyId(normalisedValue) ? normalisedValue : null;
}
function getWordFamilyById(id) {
    return exports.WORD_FAMILIES.find((family) => family.id === id);
}
function matchesWordFamily(word, familyId) {
    switch (familyId) {
        case "ai-ay":
            return word.includes("ai") || word.endsWith("ay");
        case "ee-ea":
            return word.includes("ee") || word.includes("ea");
        case "igh-ie-y":
            return word.includes("igh") || word.endsWith("ie") || word.endsWith("y");
        case "oa-ow-oe":
            return word.includes("oa") || word.endsWith("ow") || word.includes("oe");
        case "ow-ou":
            return word.includes("ow") || word.includes("ou");
        case "ar-or":
            return word.includes("ar") || word.includes("or");
        case "er-ir-ur":
            return word.includes("er") || word.includes("ir") || word.includes("ur");
        case "double-letters":
            return /([bcdfghjklmnpqrstvwxyz])\1/.test(word);
        case "split-digraphs":
            return (/a[^aeiou]?e$/.test(word) ||
                /i[^aeiou]?e$/.test(word) ||
                /o[^aeiou]?e$/.test(word) ||
                /u[^aeiou]?e$/.test(word));
        case "suffixes":
            return /(ed|ing|er|est|ly|tion|s|es|ies)$/.test(word);
        case "tricky-words":
            return false;
        case "silent_e_words":
            return /[aeiou][bcdfghjklmnpqrstvwxyz]e$/.test(word);
        case "double_letters":
            return /([bcdfghjklmnpqrstvwxyz])\1/.test(word);
        case "ck_pattern":
            return /[aeiou]ck/.test(word);
        case "schwa_unstressed_vowel":
            return /(about|animal|family|support|pencil|chicken|different|separate)/.test(word);
        case "ie_ei_patterns":
            return word.includes("ie") || word.includes("ei");
        case "tricky_common_words":
            return false;
        case "soft_c":
            return /(ce|ci|cy)/.test(word);
        case "soft_g":
            return /(ge|gi|gy)/.test(word);
        case "drop_final_e_ing":
            return /(making|hiding|baking|riding|hoping|shining)$/.test(word);
        case "change_y_to_i":
            return /(ied|ies|ier|iest)$/.test(word);
        case "double_consonant_suffix":
            return /([bcdfghjklmnpqrstvwxyz])\1(ing|ed|er|est)$/.test(word);
        case "no_double_consonant":
            return /(ing|ed|er|est)$/.test(word) && !/([bcdfghjklmnpqrstvwxyz])\1(ing|ed|er|est)$/.test(word);
        case "homophone_there_their_theyre":
        case "homophone_to_too_two":
        case "homophone_weather_whether":
        case "homophone_whose_whos":
        case "homophones_year_2":
        case "homophones_year_3_4":
            return getHomophoneWordsForFamily(familyId)
                .map(normaliseHomophoneWord)
                .includes(normaliseHomophoneWord(word));
        default:
            return false;
    }
}
function findWordFamilyForWord(word) {
    return exports.WORD_FAMILIES.find((family) => matchesWordFamily(word, family.id));
}
