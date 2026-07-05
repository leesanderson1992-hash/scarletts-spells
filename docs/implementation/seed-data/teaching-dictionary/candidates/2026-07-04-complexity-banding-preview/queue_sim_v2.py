#!/usr/bin/env python3
"""ADLE reformed-model queue simulation v2 (blueprint numbers).

Models: bundle-with-catch-up reviews (1/3/7/14/28/56), 10-word review cap,
review-debt throttle, 5-word lessons, catch-up retest then ejection,
evidence pricing per the blueprint v1 table (one production credit per word
per session; cold = 3+ day gap, cold credit capped once per 28 days).
"""
import random
from statistics import mean

INTERVALS = [1, 3, 7, 14, 28, 56]
REVIEW_CAP = 10
LESSON_WORDS = 5
CATCHUP_DELAY = 3  # retest N days after a failed review (within 7-day window)

class Word:
    __slots__ = ('id','evidence','last_prod_day','last_cold_day','state','productions')
    def __init__(self, wid):
        self.id = wid; self.evidence = 0.0
        self.last_prod_day = None; self.last_cold_day = None
        self.state = 'active'; self.productions = 0
    def credit(self, day):
        gap_ok = self.last_prod_day is None or (day - self.last_prod_day) >= 3
        cold_ok = self.last_cold_day is None or (day - self.last_cold_day) >= 28
        if gap_ok and cold_ok:
            self.evidence += 1.5; self.last_cold_day = day
        else:
            self.evidence += 0.5
        self.last_prod_day = day; self.productions += 1

class Bundle:
    __slots__ = ('words','stage','due')
    def __init__(self, words, day):
        self.words = words; self.stage = 0; self.due = day + INTERVALS[0]

def simulate(days=365, p_fail=0.15, throttled=True, seed=42, p_fail_catchup=None):
    rng = random.Random(seed)
    if p_fail_catchup is None: p_fail_catchup = p_fail
    bundles, catchups = [], []  # catchups: (due_day, word, bundle, attempts)
    pending_reteach = []        # ejected words awaiting reteach lesson
    retired, ejected_twice = [], []
    next_id = 0; lessons = 0; reteach_lessons = 0
    queue_depths = []; review_only_days = 0
    for day in range(1, days+1):
        due_words = []
        for b in bundles:
            if b.due <= day:
                due_words.extend((b, w) for w in b.words)
        due_catch = [c for c in catchups if c[0] <= day]
        total_due = len(due_words) + len(due_catch)
        queue_depths.append(total_due)
        # --- process reviews, oldest first, under cap ---
        budget = REVIEW_CAP
        # catch-up retests first (they are small and time-boxed)
        for c in sorted(due_catch, key=lambda c: c[0]):
            if budget <= 0: break
            due, w, b, attempts = c
            catchups.remove(c); budget -= 1
            if rng.random() < p_fail_catchup:
                # failed catch-up -> ejected to pending learning_item
                w.state = 'pending'
                pending_reteach.append(w)
            else:
                w.evidence += 0.5; w.productions += 1; w.last_prod_day = day
                b.words.append(w)  # rejoins bundle schedule
        # bundle reviews (whole due bundles, oldest due first)
        for b in sorted({b for b,_ in due_words}, key=lambda b: b.due):
            if budget < len(b.words): continue
            budget -= len(b.words)
            passed = []
            for w in b.words:
                if rng.random() < p_fail:
                    catchups.append((day + CATCHUP_DELAY, w, b, 1))
                else:
                    w.credit(day)
                    passed.append(w)
            b.words = passed
            b.stage += 1
            if b.stage >= len(INTERVALS):
                for w in b.words:
                    w.state = 'review_retired'; retired.append(w)
                b.words = []
            else:
                b.due = day + INTERVALS[b.stage]
            if not b.words:
                bundles.remove(b)
        # --- throttle / lesson ---
        run_lesson = (not throttled) or (total_due <= REVIEW_CAP)
        if run_lesson:
            new_words = []
            if pending_reteach:
                reteach_lessons += 1
                take = pending_reteach[:LESSON_WORDS]
                del pending_reteach[:len(take)]
                new_words.extend(take)
            while len(new_words) < LESSON_WORDS:
                w = Word(next_id); next_id += 1
                new_words.append(w)
            for w in new_words:
                w.evidence += 0.75; w.productions += 1; w.last_prod_day = day
            bundles.append(Bundle(new_words, day))
            lessons += 1
        else:
            review_only_days += 1
    introduced = next_id
    return {
        'days': days, 'p_fail': p_fail, 'throttled': throttled,
        'lessons': lessons, 'reteach_lessons': reteach_lessons,
        'lessons_per_week': round(lessons / (days/7), 2),
        'introduced': introduced, 'retired': len(retired),
        'pending_reteach_end': len(pending_reteach),
        'avg_queue': round(mean(queue_depths), 1),
        'max_queue': max(queue_depths),
        'review_only_days': review_only_days,
        'avg_evidence_at_retirement': round(mean(w.evidence for w in retired), 2) if retired else None,
        'avg_productions_at_retirement': round(mean(w.productions for w in retired), 1) if retired else None,
    }

if __name__ == '__main__':
    print(f"{'days':>4} {'fail':>5} {'thr':>5} {'lsn':>4} {'l/wk':>5} {'intro':>5} {'retired':>7} {'avgQ':>6} {'maxQ':>5} {'revOnly':>7} {'ev@ret':>6} {'prod@ret':>8}")
    for days in (180, 365):
        for pf in (0.05, 0.15, 0.25):
            for thr in (False, True):
                r = simulate(days=days, p_fail=pf, throttled=thr)
                print(f"{r['days']:>4} {r['p_fail']:>5} {str(r['throttled']):>5} {r['lessons']:>4} {r['lessons_per_week']:>5} {r['introduced']:>5} {r['retired']:>7} {r['avg_queue']:>6} {r['max_queue']:>5} {r['review_only_days']:>7} {str(r['avg_evidence_at_retirement']):>6} {str(r['avg_productions_at_retirement']):>8}")
