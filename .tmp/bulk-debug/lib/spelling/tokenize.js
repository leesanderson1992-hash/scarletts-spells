"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenizeText = tokenizeText;
const normalize_1 = require("./normalize");
const TOKEN_PATTERN = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
function tokenizeText(text) {
    return Array.from(text.matchAll(TOKEN_PATTERN), (match, index) => {
        const raw = match[0];
        const start = match.index ?? 0;
        return {
            raw,
            normalized: (0, normalize_1.normalizeWord)(raw),
            index,
            start,
            end: start + raw.length,
            isCapitalised: /^[A-Z]/.test(raw),
        };
    });
}
