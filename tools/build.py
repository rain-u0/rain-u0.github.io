#!/usr/bin/env python3
"""
Generate one static HTML file per language from template.html.

    python3 tools/build.py

Inputs
    template.html        markup with {{key}} placeholders
    i18n/strings.json    every UI string, four languages side by side

Outputs
    index.html           zh-Hant (the default page)
    index-en.html
    index-ja.html
    index-ko.html

Why a generator rather than four hand-kept files: four languages means
four copies of the same ~230 lines of markup, and every structural fix
would have to be repeated four times and would eventually drift. Here
the structure exists once.

Run this after editing template.html or i18n/strings.json. The
generated files are overwritten, so never edit index*.html directly.

Strings that are English-only (the footer line, "Scroll", "Collection")
carry the same value in all four languages on purpose; the generator
does not treat them specially.
"""

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANGS = ["zh", "en", "ja", "ko"]

# Assets whose URLs carry a hash of their own contents.
#
# Not an optimisation — a correctness fix. GitHub Pages serves
# everything with max-age=600, and gives a page and its assets
# independent lifetimes, so for ten minutes after a deploy a browser
# can hold new markup against a stylesheet it cached before it. That
# is not a cosmetic mismatch: rules the new markup depends on are
# simply absent, and the layout collapses. It has happened here.
#
# A content hash in the query string means changed asset, new URL, so
# the two can never be paired. An unchanged asset keeps its hash and
# stays cached.
SITE_ASSETS  = ["css/style.css", "js/photos.js", "js/main.js"]
ADMIN_ASSETS = ["css/admin.css", "js/admin.js"]

# admin.html is not generated from the template — it has one operator and
# no translations — but it needs the same treatment for a sharper reason.
# Stale CSS on the site is a broken layout; stale admin.js is older code
# writing to js/photos.js, which corrupts data rather than appearance.
ADMIN_PAGE = "admin.html"

# Which file each language writes to. zh keeps the bare name so the
# default URL stays clean.
OUT = {"zh": "index.html", "en": "index-en.html",
       "ja": "index-ja.html", "ko": "index-ko.html"}

# Strings consumed by js/main.js rather than the template. Injected
# into each page as window.I18N so the script stays language-agnostic.
JS_KEYS = ["js.wallpaperOn", "js.wallpaperOff", "js.enlarge",
           "js.wallpaperAlt", "js.missing"]

# Placeholders this script builds itself rather than looking up.
SYNTHETIC = {"lang.switcher"}

# Keys read by this script instead of being substituted directly.
INDIRECT = {"lang.label"}

PLACEHOLDER = re.compile(r"\{\{([A-Za-z0-9._]+)\}\}")


def load():
    template = (ROOT / "template.html").read_text(encoding="utf-8")
    strings = json.loads((ROOT / "i18n" / "strings.json").read_text(encoding="utf-8"))
    strings = {k: v for k, v in strings.items() if not k.startswith("_")}
    return template, strings


def check(template, strings):
    """Fail loudly before writing anything, so a typo cannot ship."""
    needed = set(PLACEHOLDER.findall(template)) - SYNTHETIC
    problems = []

    for key in sorted(needed - set(strings)):
        problems.append(f"template uses {{{{{key}}}}} but strings.json has no such key")

    for key in sorted(needed | set(JS_KEYS) | INDIRECT):
        entry = strings.get(key)
        if entry is None:
            continue
        for lang in LANGS:
            if lang not in entry or entry[lang] == "":
                problems.append(f"{key} is missing a {lang} value")

    unused = sorted(set(strings) - needed - set(JS_KEYS) - INDIRECT)
    for key in unused:
        problems.append(f"{key} is defined but never used (remove it or use it)")

    return problems


def switcher(current):
    """Language links. The current language is marked, not linked."""
    rows = []
    for lang in LANGS:
        label = LABELS[lang]
        if lang == current:
            rows.append(f'<span class="lang__on">{label}</span>')
        else:
            rows.append(f'<a href="{OUT[lang]}">{label}</a>')
    return '\n        '.join(rows)


def build(template, strings, lang):
    def sub(match):
        key = match.group(1)
        if key == "lang.switcher":
            return switcher(lang)
        return strings[key][lang]

    page = PLACEHOLDER.sub(sub, template)

    i18n = {k: strings[k][lang] for k in JS_KEYS}
    block = ('  <script>window.I18N = '
             + json.dumps(i18n, ensure_ascii=False)
             + ';</script>\n')
    page = page.replace('  <script src="js/photos.js"></script>',
                        block + '  <script src="js/photos.js"></script>')

    # Last, so the two replacements above still match plain filenames
    return fingerprint(page, SITE_ASSETS)


def fingerprint(page, assets):
    """Stamp each asset URL with a hash of that asset's contents."""
    for rel in assets:
        digest = hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()[:10]
        page = page.replace('"' + rel + '"', '"' + rel + '?v=' + digest + '"')
    return page


template, strings = load()
LABELS = {lang: strings["lang.label"][lang] for lang in LANGS}

problems = check(template, strings)
if problems:
    print("Build aborted:\n")
    for p in problems:
        print("  -", p)
    sys.exit(1)

for lang in LANGS:
    path = ROOT / OUT[lang]
    path.write_text(build(template, strings, lang), encoding="utf-8")
    print(f"  {OUT[lang]:18} {lang}")

# Rewritten in place: it is a source file, not a generated one, so this
# only ever swaps one query string for another.
admin = ROOT / ADMIN_PAGE
if admin.exists():
    before = admin.read_text(encoding="utf-8")
    after = fingerprint(re.sub(r'\?v=[0-9a-f]{10}"', '"', before), ADMIN_ASSETS)
    if after != before:
        admin.write_text(after, encoding="utf-8")
    print(f"  {ADMIN_PAGE:18} assets stamped")

print(f"\n{len(LANGS)} pages written.")
