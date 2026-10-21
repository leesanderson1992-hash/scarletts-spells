"""Generate six static ADLE Vowel Detective proposals for editorial review."""

from html import escape
from pathlib import Path

OUT = Path(__file__).resolve().parent
W, H = 1440, 900


def rect(x, y, w, h, fill, radius=0, stroke="none", sw=1):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def txt(x, y, value, size=18, colour="#211d38", weight=400, anchor="start", spacing=None):
    extra = f' letter-spacing="{spacing}"' if spacing else ""
    return f'<text x="{x}" y="{y}" fill="{colour}" font-family="Arial,Helvetica,sans-serif" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}"{extra}>{escape(value)}</text>'


def line(x1, y1, x2, y2, colour, width=2):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{colour}" stroke-width="{width}" stroke-linecap="round"/>'


def pill(x, y, w, label, bg, fg, border, h=42, size=16):
    return rect(x, y, w, h, bg, h / 2, border, 2) + txt(x + w / 2, y + h / 2 + size * .34, label, size, fg, 700, "middle")


def palette(dark):
    if dark:
        return dict(bg="#171426", header="#211b32", shell="#211f34", card="#2a263c", card_border="#8b6c9d",
                    ink="#f5ecfa", muted="#d7c2df", eyebrow="#ffa9d8", board="#242744", board_border="#60d7e7",
                    tile="#343a5a", tile_border="#7fd7e8", accent="#df3b99", accent_ink="#ffffff", how="#2a263c",
                    how_border="#8b6c9d", locked="#302b46")
    return dict(bg="#f5effa", header="#ffffff", shell="#f1ecfb", card="#ffffff", card_border="#e4bfe2",
                ink="#211d38", muted="#574a63", eyebrow="#a32773", board="#e8f9fc", board_border="#7fdce9",
                tile="#ffffff", tile_border="#96dbe5", accent="#c92286", accent_ink="#ffffff", how="#fff0bd",
                how_border="#e8b948", locked="#f8f0fb")


def shell(option, dark):
    p = palette(dark)
    s = [rect(0, 0, W, H, p["bg"]), rect(0, 0, W, 72, p["header"]), line(0, 72, W, 72, p["card_border"]),
         pill(28, 18, 106, "← Back", p["card"], p["ink"], p["card_border"], 36, 15),
         txt(161, 43, "Scarlett’s Spells", 23, p["eyebrow"], 800),
         txt(1200, 42, "THE SECRET LIFE OF VOWELS", 13, p["muted"], 800, "middle", 1.2),
         txt(60, 111, option.upper(), 12, p["eyebrow"], 800, spacing=1.4)]
    for x, name in [(520, "Learn"), (635, "Dinner"), (750, "Detective"), (865, "Memory"), (980, "Dictation"), (1095, "Reflect")]:
        active = name == "Detective"
        s.append(pill(x, 83, 106, name, p["accent"] if active else p["card"],
                      p["accent_ink"] if active else p["ink"], p["accent"] if active else p["card_border"], 34, 13))
    s += [rect(35, 135, 1370, 738, p["shell"], 28, p["card_border"], 1.5),
          txt(720, 185, "Vowel Detective", 42, p["ink"], 800, "middle")]
    return s, p


def game_card(x, y, w, h, p, compact=False):
    s = [rect(x, y, w, h, p["card"], 22, p["card_border"], 2),
         txt(x + 25, y + 30, "THE GAME", 13, p["eyebrow"], 800, spacing=1.4)]
    lines = [
        "A quiet vowel has gone missing from the word.",
        "Listen and choose its spelling. Then investigate related words",
        "for a clue before trying the vowel again from memory.",
    ] if not compact else [
        "A quiet vowel has gone missing. Listen and choose its spelling.",
        "Then explore related words for a clue and try again from memory.",
    ]
    for i, value in enumerate(lines):
        s.append(txt(x + 25, y + 65 + i * 29, value, 18 if not compact else 16, p["ink"], 400))
    return s


def how_card(x, y, w, h, p, stacked=False):
    s = [rect(x, y, w, h, p["how"], 22, p["how_border"], 2),
         txt(x + 25, y + 30, "HOW TO DO THE TASK", 13, p["eyebrow"], 800, spacing=1.2)]
    if stacked:
        lines = ["1  Hear the word and choose a vowel tile.",
                 "2  Submit your first thought.",
                 "3  Explore family clues, then try again."]
        for i, value in enumerate(lines):
            s.append(txt(x + 25, y + 66 + i * 32, value, 17, p["ink"], 500))
    else:
        s += [txt(x + 25, y + 65, "Hear the word  →  Choose A, E, I, O, U or Y  →  Submit", 18, p["ink"], 600),
              txt(x + 25, y + 96, "Explore its family if available, then try the vowel again without the tree.", 17, p["ink"])]
    return s


def question(x, y, width, p, small=False):
    button_w = 210 if not small else 185
    return [txt(x, y + 31, "Which vowel belongs in the gap?", 25 if not small else 22, p["ink"], 800),
            pill(x + width - button_w, y - 2, button_w, "▶ Hear the word", p["tile"], p["ink"], p["tile_border"], 50, 17)]


def word(x, y, p, size=76):
    return [txt(x, y, "hum_n", size, p["ink"], 800, "middle")]


def tiles(center, y, p, size=64, gap=12):
    total = 6 * size + 5 * gap
    x = center - total / 2
    s = []
    for i, letter in enumerate("AEIOUY"):
        at = x + i * (size + gap)
        s += [rect(at, y, size, size, p["tile"], 14, p["tile_border"], 2),
              txt(at + size / 2, y + size * .66, letter, 31, p["ink"], 800, "middle")]
    return s


def submit(x, y, p, width=240):
    return [rect(x, y, width, 56, p["accent"], 17),
            txt(x + width / 2, y + 37, "Submit vowel", 20, p["accent_ink"], 800, "middle")]


def save(name, s):
    (OUT / f"{name}.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">' + "".join(s) + "</svg>",
        encoding="utf-8")


def option_one(dark):
    s, p = shell("Option 1 · Focused steps", dark)
    s += game_card(130, 212, 1180, 155, p)
    s += how_card(130, 380, 1180, 126, p)
    s += [rect(130, 520, 1180, 320, p["board"], 25, p["board_border"], 2),
          txt(160, 549, "WORD 1 OF 5 · FIRST THOUGHT", 13, p["muted"], 800, spacing=1.2)]
    s += question(160, 559, 1118, p)
    s += word(720, 674, p)
    s += tiles(720, 696, p, 58, 10)
    s += submit(600, 771, p)
    save(f"option-1-focused-steps-{'dark' if dark else 'light'}", s)


def option_two(dark):
    s, p = shell("Option 2 · Two-card lesson", dark)
    s += game_card(70, 212, 775, 203, p, compact=True)
    s += how_card(864, 212, 506, 203, p, stacked=True)
    s += [rect(70, 429, 1300, 385, p["board"], 25, p["board_border"], 2),
          txt(98, 460, "WORD 1 OF 5 · FIRST THOUGHT", 13, p["muted"], 800, spacing=1.2)]
    s += question(98, 468, 1238, p)
    s += word(720, 610, p, 86)
    s += tiles(720, 639, p, 66, 13)
    s += [txt(720, 742, "Tap a vowel tile, or drag it into the gap.", 17, p["muted"], 600, "middle")]
    s += submit(600, 754, p)
    save(f"option-2-two-card-lesson-{'dark' if dark else 'light'}", s)


def option_three(dark):
    s, p = shell("Option 3 · Investigation desk", dark)
    s += game_card(70, 207, 1300, 119, p, compact=True)
    s += how_card(70, 338, 1300, 114, p)
    s += [rect(70, 466, 840, 369, p["board"], 25, p["board_border"], 2),
          txt(98, 497, "WORD 1 OF 5 · FIRST THOUGHT", 13, p["muted"], 800, spacing=1.2)]
    s += question(98, 505, 780, p, small=True)
    s += word(490, 648, p, 82)
    s += tiles(490, 669, p, 60, 11)
    s += submit(370, 760, p)
    s += [rect(927, 466, 443, 369, p["locked"], 25, p["card_border"], 2),
          txt(954, 503, "NEXT: FAMILY INVESTIGATION", 13, p["eyebrow"], 800, spacing=1.1),
          txt(954, 551, "Unlock after your first answer", 22, p["ink"], 800),
          txt(954, 586, "Listen to related words and", 18, p["ink"]),
          txt(954, 614, "collect clues that help you", 18, p["ink"]),
          txt(954, 642, "remember the spelling.", 18, p["ink"]),
          line(954, 679, 1342, 679, p["card_border"]),
          txt(954, 715, "Then close the tree and try", 18, p["muted"]),
          txt(954, 743, "the missing vowel again.", 18, p["muted"])]
    save(f"option-3-investigation-desk-{'dark' if dark else 'light'}", s)


if __name__ == "__main__":
    for dark in (False, True):
        option_one(dark)
        option_two(dark)
        option_three(dark)
