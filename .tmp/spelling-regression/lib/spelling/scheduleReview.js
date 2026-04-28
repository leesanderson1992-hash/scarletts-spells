"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleReview = scheduleReview;
const REVIEW_STEPS = [
    ["Day 1", 1],
    ["Day 2", 2],
    ["Day 4", 4],
    ["Day 7", 7],
    ["Day 14", 14],
    ["Day 30", 30],
];
function scheduleReview(startDate = new Date()) {
    const baseDate = typeof startDate === "string" ? new Date(startDate) : new Date(startDate);
    return REVIEW_STEPS.map(([label, offsetDays]) => {
        const nextDate = new Date(baseDate);
        nextDate.setDate(nextDate.getDate() + offsetDays);
        return {
            label,
            offsetDays,
            date: nextDate.toISOString().slice(0, 10),
        };
    });
}
