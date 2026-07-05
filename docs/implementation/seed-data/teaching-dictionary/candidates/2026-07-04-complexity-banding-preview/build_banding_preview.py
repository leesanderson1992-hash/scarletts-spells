#!/usr/bin/env python3
"""ADLE word-complexity banding v1 — PREVIEW ONLY.

Reads the Phase 5 candidate Teaching Dictionary CSVs and computes the
proposed structural Level (1-4) per word, the per-micro-skill per-level
allocation table, and the under-floor report. Writes preview artefacts;
mutates nothing canonical.
"""
import csv, json, re, sys, unicodedata
from collections import Counter, defaultdict

CSV_DIR = "/Users/katiesanderson/Documents/Scarletts Spells/scarletts-spells/docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv"
BANDING_VERSION = "banding_v1.1_2026-07-04.preview"  # 3-level scheme

# ---------- irregularity band mapping (banding v1.1) ----------
IRREGULAR_CLASS2 = {
    'common high-frequency tricky word', 'simple high-frequency tricky word',
    'longer high-frequency tricky word', 'irregular function word',
    'function word homophone', 'content word homophone',
    'contraction/possessive homophone',
    'silent b/t', 'silent kn', 'silent mb', 'silent wr',
    'gh for f', 'ould word', 'wor for /wer/', 'wa altered vowel',
    'remembered double letter word',
}
# everything else non-empty and not 'regular' is class 1 (conditional/pattern)

def irregularity_band(note):
    note = note.strip()
    if not note or note == 'regular':
        return 0
    if note in IRREGULAR_CLASS2:
        return 2
    return 1

# ---------- phoneme counting ----------
IPA_DIPHTHONGS = ['aʊ','əʊ','eɪ','aɪ','ɔɪ','ɪə','eə','ʊə']
IPA_AFFRICATES = ['tʃ','dʒ']
IPA_LONG = ['iː','uː','ɑː','ɔː','ɜː']
IPA_STRIP = 'ˈˌ. ˑ‿'

def count_ipa_phonemes(s):
    s = s.strip().strip('/')
    for ch in IPA_STRIP:
        s = s.replace(ch, '')
    n = 0
    i = 0
    multis = IPA_DIPHTHONGS + IPA_AFFRICATES + IPA_LONG
    while i < len(s):
        matched = False
        for m in multis:
            if s.startswith(m, i):
                n += 1; i += len(m); matched = True; break
        if not matched:
            if not unicodedata.category(s[i]).startswith('M'):
                n += 1
            i += 1
    return n

def count_phonemes(hint):
    hint = hint.strip()
    if not hint:
        return None
    first = hint.split(' / ')[0].strip()
    if first.startswith('/'):
        return count_ipa_phonemes(first)
    # ARPAbet: space-separated tokens
    return len(first.split())

def morph_depth(morphemes):
    if ':' not in morphemes:
        return 1
    body = morphemes.split(':', 1)[1]
    if not body.strip():
        return 1
    return body.count('+') + 1

# ---------- scoring ----------
def syllable_points(syl):
    return {1: 0, 2: 1, 3: 2}.get(syl, 3)

def length_points(L):
    if L <= 4: return 0
    if L <= 6: return 1
    if L <= 8: return 2
    return 3

def irregularity_points(band):
    return {0: 0, 1: 2, 2: 4}[band]

def morph_points(d):
    return {1: 0, 2: 1}.get(d, 2)

def structural_score(row):
    return (syllable_points(row['syllables']) + length_points(row['length'])
            + irregularity_points(row['irr_band']) + morph_points(row['morph_depth'])
            + (1 if row['has_schwa'] else 0) + (1 if row['mismatch'] else 0))

def level_from_score(s, bounds):
    """bounds = ascending upper-inclusive score bounds for levels 1..n-1;
    scores above the last bound are the top level (n = len(bounds)+1)."""
    for i, b in enumerate(bounds):
        if s <= b:
            return i + 1
    return len(bounds) + 1

def n_levels(bounds):
    return len(bounds) + 1

def main(thresholds):
    words = {w['word_key']: w for w in csv.DictReader(open(f"{CSV_DIR}/canonical_words.csv"))}
    meta = {m['word_key']: m for m in csv.DictReader(open(f"{CSV_DIR}/canonical_word_metadata.csv"))}
    support = list(csv.DictReader(open(f"{CSV_DIR}/micro_skill_word_support.csv")))

    rows = {}
    for k, w in words.items():
        m = meta.get(k)
        if not m:
            continue
        nw = w['normalised_word']
        letters = len(re.sub(r"[^a-z]", "", nw))
        ph = count_phonemes(m['phoneme_hint'])
        mismatch = ph is not None and (letters - ph) >= 3
        r = {
            'word_key': k, 'word': nw,
            'syllables': int(m['syllables']) if m['syllables'].strip() else 1,
            'length': letters,
            'irr_note': m['irregularity_notes'].strip(),
            'irr_band': irregularity_band(m['irregularity_notes']),
            'morph_depth': morph_depth(m['morphemes']),
            'has_schwa': m['has_schwa'].strip().upper() == 'TRUE',
            'phonemes': ph,
            'mismatch': mismatch,
            'frequency_band': w['frequency_band'],
            'age_band': w['age_band'],
        }
        r['score'] = structural_score(r)
        r['level'] = level_from_score(r['score'], thresholds)
        rows[k] = r

    global LEVEL_RANGE
    LEVEL_RANGE = range(1, n_levels(thresholds) + 1)
    dist = Counter(r['score'] for r in rows.values())
    lev = Counter(r['level'] for r in rows.values())
    print(f"thresholds={thresholds}")
    print("score dist:", sorted(dist.items()))
    print("level dist:", sorted(lev.items()))

    # allocation table: skill x level counts (support_example + review_example roles;
    # contrast words support teaching, not breadth)
    alloc = defaultdict(Counter)
    for s in support:
        if s['support_role'] == 'contrast':
            continue
        r = rows.get(s['word_key'])
        if r:
            alloc[s['micro_skill_key']][r['level']] += 1

    cells = [(sk, L, alloc[sk][L]) for sk in alloc for L in LEVEL_RANGE if alloc[sk][L] > 0]
    under = [c for c in cells if c[2] < 8]
    print(f"skills: {len(alloc)}; populated skill/level cells: {len(cells)}; under floor 8: {len(under)} ({100*len(under)/len(cells):.0f}%)")
    per_skill_words = Counter()
    for sk in alloc:
        per_skill_words[sk] = sum(alloc[sk].values())
    ps = sorted(per_skill_words.values())
    print("words per skill: min", ps[0], "median", ps[len(ps)//2], "max", ps[-1],
          "skills with <8 total:", sum(1 for v in ps if v < 8),
          "skills with <2:", sum(1 for v in ps if v < 2))
    return rows, alloc

# ---------- artefact emission ----------
def emit(rows, alloc, out_dir, thresholds):
    import os
    os.makedirs(out_dir, exist_ok=True)
    with open(f"{out_dir}/word_complexity_banding_preview.csv", 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['word_key','normalised_word','syllables','letter_count','phoneme_count',
                    'syllable_points','length_points','irregularity_band','irregularity_points',
                    'morphology_depth','morphology_points','has_schwa','mismatch_flag',
                    'structural_score','complexity_level','frequency_band','age_band',
                    'irregularity_note_source','banding_version'])
        for r in sorted(rows.values(), key=lambda x: x['word_key']):
            w.writerow([r['word_key'], r['word'], r['syllables'], r['length'], r['phonemes'],
                        syllable_points(r['syllables']), length_points(r['length']),
                        r['irr_band'], irregularity_points(r['irr_band']),
                        r['morph_depth'], morph_points(r['morph_depth']),
                        r['has_schwa'], r['mismatch'], r['score'], r['level'],
                        r['frequency_band'], r['age_band'], r['irr_note'], BANDING_VERSION])
    with open(f"{out_dir}/micro_skill_level_allocation_preview.csv", 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['micro_skill_key','level','allocation','target_preview','under_floor_8','banding_version'])
        for sk in sorted(alloc):
            for L in LEVEL_RANGE:
                a = alloc[sk][L]
                if a == 0:
                    continue
                import math
                target = min(20, math.ceil(0.6*a))
                w.writerow([sk, L, a, max(target, min(a, 8)) if a >= 8 else a,
                            a < 8, BANDING_VERSION])
    words_per_skill = {sk: sum(alloc[sk].values()) for sk in alloc}
    cells = [(sk, L, alloc[sk][L]) for sk in alloc for L in LEVEL_RANGE if alloc[sk][L] > 0]
    summary = {
        'banding_version': BANDING_VERSION,
        'level_count': n_levels(thresholds),
        'level_upper_bounds': list(thresholds),
        'word_count': len(rows),
        'level_distribution': dict(Counter(r['level'] for r in rows.values())),
        'score_distribution': dict(Counter(r['score'] for r in rows.values())),
        'skills_with_mapped_words': len(alloc),
        'populated_skill_level_cells': len(cells),
        'cells_under_floor_8': sum(1 for c in cells if c[2] < 8),
        'skills_under_8_total_words': sum(1 for v in words_per_skill.values() if v < 8),
        'skills_under_2_total_words': sum(1 for v in words_per_skill.values() if v < 2),
        'median_words_per_skill': sorted(words_per_skill.values())[len(words_per_skill)//2],
        'blank_irregularity_notes': sum(1 for r in rows.values() if not r['irr_note']),
        'mismatch_flag_count': sum(1 for r in rows.values() if r['mismatch']),
        'note': 'PREVIEW ONLY - no canonical mutation; pending owner approval of banding formula v1.1 (3-level scheme)',
    }
    with open(f"{out_dir}/banding_preview_summary.json", 'w') as f:
        json.dump(summary, f, indent=2)
    print("artefacts written to", out_dir)
    return summary

if __name__ == '__main__':
    t = tuple(int(x) for x in sys.argv[1:]) if len(sys.argv) > 1 else (1, 5)
    rows, alloc = main(t)
    import os
    emit(rows, alloc, os.path.dirname(os.path.abspath(__file__)), t)
