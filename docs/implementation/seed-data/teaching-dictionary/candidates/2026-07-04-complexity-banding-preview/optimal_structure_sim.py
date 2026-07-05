#!/usr/bin/env python3
"""ADLE optimal-structure simulation (Tier 2: forgetting-curve Monte Carlo).

Question: under 20 min/day, 5 days/week, what balance between fast
relearning of failed words and spaced repetition retains the most words?

Memory model (FSRS-lite):
  recall probability at gap t with stability S:  p = (1 + t/(9S))^-1
  (p = 0.90 when t = S; power forgetting, gentler tail than exponential)
  success at gap t: S' = S * min(6, 1 + 1.2*(t/S)**0.8)   (spacing effect:
     harder retrieval -> bigger stability gain)
  failure:          S' = max(0.5, 0.3*S), word needs the policy's relearn path
  initial teach:    S0 = 2.0 * lognormal(sigma=0.4) / difficulty
  re-teach after ejection: same, x1.5 (savings from prior exposure)
  difficulty by banding level (real dictionary shares): L1 48.5% d=1.0,
     L2 39% d=1.3, L3 12.5% d=1.6

Session budget: 25 child responses (~20 min), Mon-Fri only.
Costs: review production 1 (+2 reflection if wrong); catch-up retest 1 (+2
if wrong); lesson (intro+guided+production of 5 words) 12.
Reviews always first, oldest-due first. A lesson runs only when the due
queue is empty and >=12 budget remains (natural review-debt throttle).
"""
import random, math
from statistics import mean, stdev

BUDGET = 25
LESSON_COST = 12
REFLECT = 2
HORIZON = 400
COHORT_CUTOFF = 200   # retention measured for words introduced by day 200

LEVEL_MIX = [(1.0, 0.485), (1.3, 0.390), (1.6, 0.125)]

def draw_difficulty(rng):
    x = rng.random(); acc = 0
    for d, share in LEVEL_MIX:
        acc += share
        if x <= acc: return d
    return 1.6

def p_recall(t, S): return 1.0 / (1.0 + t/(9.0*S))
def grow(S, t):     return S * min(6.0, 1.0 + 1.2*(t/S)**0.8)

class Word:
    __slots__=('S','difficulty','stage','due','last','born','state','fails_in_row','cost')
    def __init__(self, day, d, S0):
        self.S=S0; self.difficulty=d; self.stage=0; self.last=day; self.born=day
        self.state='review'; self.fails_in_row=0; self.cost=0.0

def simulate(intervals, fail_policy, seed, budget=BUDGET, days=HORIZON):
    rng = random.Random(seed)
    words=[]; queue=[]   # queue: (due_day, word)
    reteach=[]
    spent_total=0
    def teach(day, w=None):
        # returns list of words taught (5 per lesson: reteach first, rest new)
        taught=[]
        while len(taught)<5:
            if reteach:
                w0=reteach.pop(0)
                w0.S = 2.0*rng.lognormvariate(0,0.4)/w0.difficulty*1.5
                w0.stage=0; w0.state='review'; w0.fails_in_row=0; w0.last=day
                taught.append(w0)
            else:
                w0=Word(day, draw_difficulty(rng), 0.0)
                w0.S = 2.0*rng.lognormvariate(0,0.4)/w0.difficulty
                words.append(w0); taught.append(w0)
        for w0 in taught:
            queue.append((day+intervals[0], w0))
        return taught

    for day in range(1, days+1):
        if day % 7 in (6, 0):   # Sat=6, Sun=0 (day1=Mon)
            continue
        budget_left = budget
        due = sorted([q for q in queue if q[0] <= day], key=lambda q: q[0])
        for item in due:
            if budget_left < 1: break
            queue.remove(item); _, w = item
            t = day - w.last
            per_item = 1
            ok = rng.random() < p_recall(t, w.S)
            if ok:
                w.S = grow(w.S, t); w.last = day; w.fails_in_row = 0
                if w.state == 'catchup':
                    w.state='review'   # rejoins its schedule
                    queue.append((day + intervals[min(w.stage, len(intervals)-1)], w))
                else:
                    w.stage += 1
                    if w.stage < len(intervals):
                        queue.append((day + intervals[w.stage], w))
                    else:
                        w.state='retired'
            else:
                per_item += REFLECT
                w.S = max(0.5, 0.3*w.S); w.last = day; w.fails_in_row += 1
                if fail_policy == 'demote_repeat':      # repeat same interval
                    queue.append((day + intervals[min(w.stage, len(intervals)-1)], w))
                elif fail_policy == 'reset_ladder':     # back to interval 1
                    w.stage = 0
                    queue.append((day + intervals[0], w))
                elif fail_policy == 'eject_fast':       # straight to reteach
                    w.state='pending'; reteach.append(w)
                elif fail_policy == 'catchup_3d':       # blueprint: retest +3
                    if w.fails_in_row >= 2:
                        w.state='pending'; reteach.append(w)
                    else:
                        w.state='catchup'; queue.append((day+3, w))
                elif fail_policy == 'catchup_next_day': # fast relearn: retest +1 then +3
                    if w.fails_in_row >= 3:
                        w.state='pending'; reteach.append(w)
                    else:
                        w.state='catchup'
                        queue.append((day + (1 if w.fails_in_row==1 else 3), w))
            budget_left -= per_item; w.cost += per_item; spent_total += per_item
        remaining_due = [q for q in queue if q[0] <= day]
        if not remaining_due and budget_left >= LESSON_COST:
            taught = teach(day)
            share = LESSON_COST/len(taught)
            for w0 in taught: w0.cost += share
            spent_total += LESSON_COST

    cohort = [w for w in words if w.born <= COHORT_CUTOFF]
    exp_ret = sum(p_recall(HORIZON - w.last, w.S) for w in cohort)
    solid   = sum(1 for w in cohort if p_recall(HORIZON - w.last, w.S) >= 0.85)
    pend    = sum(1 for w in words if w.state=='pending')
    return {
        'introduced': len(words), 'cohort': len(cohort),
        'exp_retained': exp_ret,
        'retention_rate': exp_ret/len(cohort) if cohort else 0,
        'solid': solid, 'pending_end': pend,
        'cost_per_retained': spent_total/exp_ret if exp_ret else float('inf'),
        'retired': sum(1 for w in words if w.state=='retired'),
    }

INTERVAL_SETS = {
    'blueprint 1/3/7/14/28/56':      [1,3,7,14,28,56],
    'double 1/2/4/8/16/32/64':       [1,2,4,8,16,32,64],
    'lean 2/7/21/60':                [2,7,21,60],
    'extended 1/3/7/14/28/56/112':   [1,3,7,14,28,56,112],
    'gentle-start 1/2/5/12/28/56':   [1,2,5,12,28,56],
}
POLICIES = ['catchup_3d','catchup_next_day','demote_repeat','reset_ladder','eject_fast']

def run(budget=BUDGET, seeds=30):
    print(f"budget={budget} responses/session, Mon-Fri, horizon {HORIZON}d, cohort <= day {COHORT_CUTOFF}, {seeds} seeds")
    print(f"{'intervals':<30} {'fail policy':<18} {'intro':>6} {'retained':>9} {'rate':>6} {'solid':>6} {'cost/word':>9} {'retired':>7}")
    results={}
    for iname, ints in INTERVAL_SETS.items():
        for pol in POLICIES:
            rs=[simulate(ints,pol,seed=s,budget=budget) for s in range(seeds)]
            m=lambda k: mean(r[k] for r in rs)
            results[(iname,pol)] = m('exp_retained')
            print(f"{iname:<30} {pol:<18} {m('introduced'):>6.0f} "
                  f"{m('exp_retained'):>6.1f}±{stdev(r['exp_retained'] for r in rs):>4.1f} "
                  f"{m('retention_rate'):>5.0%} {m('solid'):>6.0f} {m('cost_per_retained'):>9.1f} {m('retired'):>7.0f}")
    best=max(results, key=results.get)
    print("\nBest by expected retained words:", best, f"{results[best]:.1f}")
    return results

if __name__=='__main__':
    run()
