"""Render static, production-shaped Call It To Dinner layout proposals."""

from html import escape
from pathlib import Path

OUT = Path(__file__).resolve().parent
W, H = 1440, 900


def rect(x, y, w, h, fill, radius=0, stroke="none", sw=1):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def txt(x, y, value, size=22, colour="#18233c", weight=400, anchor="start", spacing=None):
    extra = f' letter-spacing="{spacing}"' if spacing else ""
    return f'<text x="{x}" y="{y}" fill="{colour}" font-family="Arial,Helvetica,sans-serif" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}"{extra}>{escape(value)}</text>'


def line(x1, y1, x2, y2, colour, width=2):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{colour}" stroke-width="{width}" stroke-linecap="round"/>'


def pill(x, y, w, label, fill="#ffffff", colour="#18233c", border="#e5cceb", h=38, size=17):
    return rect(x, y, w, h, fill, h / 2, border, 2) + txt(x + w / 2, y + h / 2 + size * .34, label, size, colour, 700, "middle")


def common(label):
    s = [rect(0, 0, W, H, "#f5effa"), rect(0, 0, W, 72, "#ffffff"), line(0, 72, W, 72, "#e2cce8")]
    s += [pill(28, 18, 106, "← Back", h=36, size=15), txt(161, 43, "Scarlett’s Spells", 23, "#952d70", 800), txt(1200, 42, "THE SECRET LIFE OF VOWELS", 13, "#694b73", 800, "middle", 1.2)]
    s += [txt(60, 111, label.upper(), 12, "#8e4a83", 800, spacing=1.4)]
    steps = [(520, "Learn", False), (635, "Dinner", True), (750, "Detective", False), (885, "Memory", False), (1000, "Dictation", False), (1124, "Reflect", False)]
    for x, name, active in steps:
        s.append(pill(x, 83, 106, name, "#c12783" if active else "#fff", "#fff" if active else "#674c70", "#c12783" if active else "#e2cce8", 34, 13))
    return s


def common_dark(label):
    s = [rect(0, 0, W, H, "#171426"), rect(0, 0, W, 72, "#211b32"), line(0, 72, W, 72, "#665477")]
    s += [pill(28, 18, 106, "← Back", "#312a45", "#fff2ff", "#8f6ca2", 36, 15),
          txt(161, 43, "Scarlett’s Spells", 23, "#ff9acd", 800),
          txt(1200, 42, "THE SECRET LIFE OF VOWELS", 13, "#d7c2df", 800, "middle", 1.2),
          txt(60, 111, label.upper(), 12, "#e9a9d4", 800, spacing=1.4)]
    steps = [(520, "Learn", False), (635, "Dinner", True), (750, "Detective", False), (885, "Memory", False), (1000, "Dictation", False), (1124, "Reflect", False)]
    for x, name, active in steps:
        s.append(pill(x, 83, 106, name, "#df3b99" if active else "#30283f", "#ffffff" if active else "#e5d4ed", "#df3b99" if active else "#6e587e", 34, 13))
    return s


def title(y, sub=None):
    s = [txt(720, y, "Call It To Dinner", 40, "#211b3a", 800, "middle")]
    if sub:
        s.append(txt(720, y + 30, sub, 16, "#65506e", 500, "middle"))
    return s


def cleaver(x, y, scale=1):
    return f'<g transform="translate({x},{y}) scale({scale})"><path d="M0 0h48c8 0 14 6 14 14v28H6c-4 0-6-3-6-7z" fill="#bceff7" stroke="#219bb0" stroke-width="3"/><path d="M60 39l22 26" stroke="#a05719" stroke-width="9" stroke-linecap="round"/><path d="M60 39l22 26" stroke="#f6cf84" stroke-width="3" stroke-linecap="round"/><circle cx="15" cy="16" r="4" fill="#49b8c7"/></g>'


def word_board(x, y, w, h, style):
    dark = style == "dark"
    fill = "#242744" if dark else "#e7f9fc"
    border = "#60d7e7" if dark else "#87dfe9"
    ink = "#ffffff" if dark else "#17223a"
    s = [rect(x, y, w, h, fill, 28, border, 2)]
    s.append(txt(x + 29, y + 31, "WORD TILE · CHOP, THEN SELECT", 12, "#74dce6" if dark else "#2b7286", 800, spacing=1.4))
    cx = x + w / 2
    positions = [cx - 175, cx - 95, cx - 15, cx + 85, cx + 165]
    for i, (px, letter) in enumerate(zip(positions, "comma")):
        if i == 4:
            s.append(rect(px - 23, y + 57, 46, 62, "#ffe29a", 12, "#edae40", 2))
        s.append(txt(px, y + 104, letter, 53, "#442a14" if i == 4 else ink, 800, "middle"))
    for index, px in enumerate([cx - 135, cx - 55, cx + 35, cx + 125]):
        s.append(line(px, y + 65, px, y + 112, "#e39421" if index == 2 else "#37c8d9", 6 if index == 2 else 4))
    s.append(cleaver(x + 70, y + 56, .66))
    s.append(pill(cx - 116, y + 130, 100, "com", "#fff" if not dark else "#343a5a", ink, border, 37, 19))
    s.append(pill(cx + 17, y + 130, 100, "ma", "#fff" if not dark else "#343a5a", ink, border, 37, 19))
    s.append(pill(cx - 110, y + h - 50, 220, "▶ Listen to comma", "#fff" if not dark else "#343a5a", ink, border, 38, 15))
    return s


def button(x, y, w=290, label="Confirm answer", fill="#ca2686"):
    return rect(x, y, w, 55, fill, 18) + txt(x + w / 2, y + 36, label, 20, "#ffffff", 800, "middle")


GAME_LINES = [
    "The goal of the game is to identify the stressed and unstressed syllables of the word.",
    "It is a fun game called “Call It To Dinner”. Call each word as if you were shouting",
    "its name to come downstairs for dinner. This shows which syllable we put the",
    "largest amount of stress on. For example, SCAR-lett.",
    "We cannot find unstressed vowels in a stressed syllable. Once we know the",
    "unstressed syllables, we can identify the unstressed sound of “uh” or “ih”.",
    "Remember: There can be more than 2 syllables in a word.",
]

BEFORE = "BEFORE CUT · Look at the word below. First step: CALL IT TO DINNER! Chop it into syllables."
LISTEN_NOTE = "Listen button underneath."
AFTER = "AFTER CUT · Great! Well done, now select the LAZY vowel sound."
SUCCESS = "ON CORRECT ANSWER · Well done! You found the lazy sound."


def game_copy(x, y, line_height=26, size=18, colour="#2b2840"):
    return [txt(x, y + i * line_height, value, size, colour, 400 if i not in (0, 6) else 700) for i, value in enumerate(GAME_LINES)]


def frame(name, content):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">' + "".join(content) + "</svg>"
    (OUT / f"{name}.svg").write_text(svg, encoding="utf-8")


def option_one():
    s = common("Option 1 · Focused stack") + title(162)
    s += [rect(183, 184, 1074, 190, "#ffffff", 22, "#e5c4e4", 2), txt(209, 210, "THE GAME", 12, "#9e2a76", 800, spacing=1.4)]
    s += game_copy(209, 236, 21, 16)
    s += [rect(183, 387, 1074, 111, "#fff1bf", 20, "#e5b950", 2), txt(209, 413, "HOW TO DO THE TASK · THE LIVE BOX CHANGES AFTER THE CUT", 12, "#72510c", 800, spacing=1.2),
          txt(209, 439, BEFORE, 16, "#3b2c14", 700), txt(209, 462, LISTEN_NOTE, 16, "#3b2c14"), txt(209, 486, AFTER, 16, "#3b2c14", 700)]
    s += word_board(183, 511, 1074, 237, "light")
    s += [pill(183, 765, 128, "Word 1 of 5", "#fff", "#744369", "#e5c4e4", 45, 15), button(575, 758),
          txt(720, 856, SUCCESS, 17, "#2d7153", 700, "middle")]
    frame("option-1-focused-stack", s)


def option_two():
    s = common("Option 2 · Two-card lesson") + title(159)
    s += [rect(70, 184, 775, 306, "#ffffff", 23, "#e5c4e4", 2), rect(864, 184, 506, 306, "#fff1bf", 23, "#e5b950", 2),
          txt(95, 210, "THE GAME", 12, "#9e2a76", 800, spacing=1.4)]
    s += game_copy(95, 236, 35, 15)
    s += [txt(889, 211, "HOW TO DO THE TASK", 12, "#72510c", 800, spacing=1.2),
          txt(889, 246, "BEFORE CUT", 15, "#67480b", 800),
          txt(889, 274, "Look at the word below. First step:", 17, "#3b2c14"),
          txt(889, 302, "CALL IT TO DINNER! Chop it into", 17, "#3b2c14", 700),
          txt(889, 330, "syllables. Listen button underneath.", 17, "#3b2c14"),
          line(889, 347, 1342, 347, "#e2b44c", 2),
          txt(889, 378, "AFTER CUT", 15, "#67480b", 800),
          txt(889, 406, "Great! Well done, now select the", 17, "#3b2c14"),
          txt(889, 434, "LAZY vowel sound.", 17, "#3b2c14", 700),
          txt(889, 468, "These two messages replace each other.", 13, "#72510c")]
    s += word_board(70, 504, 1300, 245, "light")
    s += [pill(71, 767, 128, "Word 1 of 5", "#fff", "#744369", "#e5c4e4", 45, 15),
          txt(231, 796, SUCCESS, 16, "#2d7153", 700), button(1078, 758)]
    frame("option-2-two-card-lesson", s)


def option_two_dark():
    s = common_dark("Option 2 · Dark two-card lesson")
    s += [txt(720, 159, "Call It To Dinner", 40, "#fff4ff", 800, "middle"),
          rect(70, 184, 775, 306, "#2a263c", 23, "#8b6c9d", 2),
          rect(864, 184, 506, 306, "#2a263c", 23, "#8b6c9d", 2),
          txt(95, 210, "THE GAME", 12, "#ffa9d8", 800, spacing=1.4)]
    s += game_copy(95, 236, 35, 15, "#f5ecfa")
    s += [txt(889, 211, "HOW TO DO THE TASK", 12, "#ffa9d8", 800, spacing=1.2),
          txt(889, 246, "BEFORE CUT", 15, "#f5d0e9", 800),
          txt(889, 274, "Look at the word below. First step:", 17, "#f5ecfa"),
          txt(889, 302, "CALL IT TO DINNER! Chop it into", 17, "#f5ecfa", 700),
          txt(889, 330, "syllables. Listen button underneath.", 17, "#f5ecfa"),
          line(889, 347, 1342, 347, "#8b6c9d", 2),
          txt(889, 378, "AFTER CUT", 15, "#f5d0e9", 800),
          txt(889, 406, "Great! Well done, now select the", 17, "#f5ecfa"),
          txt(889, 434, "LAZY vowel sound.", 17, "#f5ecfa", 700),
          txt(889, 468, "These two messages replace each other.", 13, "#d7c2df")]
    s += word_board(70, 504, 1300, 245, "dark")
    s += [pill(71, 767, 128, "Word 1 of 5", "#30283f", "#fff2ff", "#8f6ca2", 45, 15),
          txt(231, 796, SUCCESS, 16, "#a9edca", 700),
          button(1078, 758, fill="#df3b99")]
    frame("option-2-two-card-lesson-dark", s)


def option_three():
    s = common("Option 3 · Immersive game board") + title(159)
    s += [rect(147, 184, 1146, 190, "#ffffff", 23, "#e5c4e4", 2), txt(174, 210, "THE GAME", 12, "#9e2a76", 800, spacing=1.4)]
    s += game_copy(174, 236, 21, 16)
    s += [rect(147, 388, 1146, 111, "#fff1bf", 20, "#e5b950", 2),
          txt(174, 414, "HOW TO DO THE TASK · CHANGES AFTER THE CUT", 12, "#72510c", 800, spacing=1.1),
          txt(174, 440, BEFORE, 16, "#3b2c14", 700), txt(174, 463, LISTEN_NOTE, 16, "#3b2c14"), txt(174, 486, AFTER, 16, "#3b2c14", 700)]
    s += word_board(147, 510, 1146, 236, "dark")
    s += [rect(0, 770, 1440, 130, "#ffffff"), line(0, 770, 1440, 770, "#e5c4e4", 2),
          pill(147, 791, 132, "Word 1 of 5", "#f7e6f1", "#82366e", "#e5c4e4", 47, 15),
          txt(309, 821, SUCCESS, 16, "#2d7153", 700), button(1003, 786, 290)]
    frame("option-3-game-board", s)


if __name__ == "__main__":
    option_one()
    option_two()
    option_two_dark()
    option_three()
