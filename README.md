# rain_u.0

A personal wallpaper collection. Plain HTML, CSS and JavaScript —
**no libraries and no build step**. Upload the folder and it runs.

```
template.html       the single markup source — edit this, not index*.html
i18n/strings.json   every UI string, four languages side by side
tools/build.py      generates the four language pages from the two above

index.html          GENERATED — zh-Hant
index-en.html       GENERATED — English
index-ja.html       GENERATED — Japanese
index-ko.html       GENERATED — Korean

css/style.css       everything visual; design tokens at the top
js/photos.js        the photo list, with titles in all four languages
js/main.js          scroll reveal, gallery, lightbox, nav indicator
images/             46 photos + 46 wallpaper screenshots + me.jpg
tools/optimize.sh   turns source photos into web-ready files
tools/download.sh   one-off fetch from the shared Drive folder (archived)
```

**The four `index*.html` files are generated and overwritten.** Edit
`template.html` and `i18n/strings.json`, then run:

```bash
python3 tools/build.py
```

---

# Adding a photo, start to finish

**Adding a photo never needs `build.py`.** That script reads only
`template.html` and `i18n/strings.json`; the photo list is not one of
its inputs. Add the row, and every page picks it up.

There are two routes, and which one you take depends on one thing:
**can you run `tools/optimize.sh`?** It needs `qlmanage` and `sips`,
which only exist on macOS. Everything else — git, the browser, the
site itself — works anywhere.

Pick one route. Do not mix them: the script writes its output
straight into `images/` in your local clone, so once it has run, the
files are already where they need to be and uploading them through
the browser would only be a detour.

---

## Route A — on a Mac, with git

Four steps. The script does all the fiddly parts.

**1. Put the originals in a folder.**

```
~/Downloads/new-photos/
  morning_latte.HEIC          the photo
  morning_latte_demo.PNG      the lock screen with it set as wallpaper
```

Two rules:

- The wallpaper shot must be **the same name plus `_demo`**. That
  suffix is how the script tells the two apart.
- **Rename anything not in English first.** A name with no ASCII left
  in it — `夕陽.HEIC`, say — sanitises down to an empty string, and
  the script skips the file. It says so, but the line is easy to miss
  in a long run.

**2. Run the script.**

```bash
cd ~/rain-u0.github.io
bash tools/optimize.sh ~/Downloads/new-photos
```

```
  morning_latte           1179x2066   287 KB
  morning_latte_demo      1179x2556   341 KB   (wallpaper shot)

Ready-to-paste rows are in: tools/photos-data.txt
```

That single command converts HEIC to JPEG, caps the long edge at
1600px, fixes the rotation, lower-cases the filename, measures the
image, and writes the finished row. Nothing here is left to do by
hand.

**3. Paste the row into `js/photos.js`.**

Open `tools/photos-data.txt` and copy the entry — **both lines**,
it is one row wrapped for width:

```js
  { file: 'morning_latte', cat: '', w: 1179, h: 2066, demo: true,
    t: { zh: '', en: '', ja: '', ko: '' } },
```

Fill in `cat` and all four titles. This is the only part that needs
you; the numbers are already correct. Paste it under the matching
category comment — the gallery renders in array order, so a row in
the wrong block appears out of group under "All".

**4. Preview, then push.**

```bash
python3 -m http.server 8000     # http://localhost:8000
git add -A
git commit -m "Add morning_latte"
git push
```

The photo count in the heading and on every filter button is computed
at runtime, so no number anywhere needs touching.

---

## Route B — no dev environment, browser only

Use this on a borrowed machine, on Windows, or on Linux — anywhere
`optimize.sh` cannot run. It works, but the script's whole job now
falls to you.

**1. Prepare each image yourself**, to the same four requirements:

| Requirement | Why |
|---|---|
| JPEG, not HEIC | Chrome and Firefox cannot display HEIC at all |
| Long edge ≤ 1600px | originals run several MB; this lands at 200–400 KB |
| Filename lower-case, ASCII only, no spaces | Pages matches paths byte for byte, so `.JPG` or an `ä` 404s once deployed |
| Rotation already applied | a portrait phone photo is landscape pixels plus a rotate flag; strip the flag and it ships sideways |

Name the wallpaper shot `<photo>_demo.jpg`.

**2. Measure each image.** You need its pixel width and height for
the next step. Finder's Get Info on macOS, right-click → Properties →
Details on Windows.

**3. Upload.** On the repo: **Add file → Upload files**, drop them
into `images/`, commit. The uploader takes 100 files at a time.

**4. Edit `js/photos.js` in the browser.** Open it, click the pencil,
add the row by hand, commit:

```js
  { file: 'morning_latte', cat: 'linger', w: 1179, h: 2066, demo: true,
    t: { zh: '晨間拿鐵', en: 'Morning Latte', ja: '朝のラテ', ko: '아침 라떼' } },
```

---

## Either route

**All four titles are required.** `main.js` reads `t[lang]` and falls
back to an empty string, so a language left blank renders an untitled
tile on that page and reports nothing. One row serves all four
languages — the same `js/photos.js` is loaded by all four pages, and
the filename itself has no language.

**Never upload `tools/photos-data.txt`.** It is scratch: rewritten
from scratch on every run, and spent the moment its rows are pasted
across. `.gitignore` already keeps it out.

---

## Adding photos

Reference behind the two routes above: why the script is not
optional, and what each field in a row means.

### 1. Process the files

**Never drag originals straight into `images/`.** Always run:

```bash
bash tools/optimize.sh ~/Downloads/new-photos
```

The script writes into `images/` and prints the dimensions you need
next. Three reasons it is not optional:

| Problem | Why it matters |
|---|---|
| HEIC is unsupported | Chrome and Firefox cannot display HEIC at all. Only Safari can. |
| Filename casing and Unicode | GitHub Pages is case-sensitive and matches paths byte for byte. macOS is case-insensitive and normalises Unicode, so `.JPG` or an `ä` in a name works locally and 404s once deployed. |
| File size | PNG originals run several MB each; wallpaper screenshots reach 8–13 MB. Web JPEG at 1600px is about 200–400 KB. |

The script also fixes orientation. A portrait iPhone photo is stored
as landscape pixels plus rotation metadata; `sips` alone gets this
wrong and the image comes out sideways, so the script routes through
`qlmanage` first. See the comments in the script for detail.

### 2. Add a row to `js/photos.js`

Copy the generated rows from `tools/photos-data.txt` and fill in the
titles and category:

```js
{ file: 'ginkgo_forest', cat: 'mood', w: 909, h: 1600, demo: true,
  t: { zh: '銀杏森林', en: 'Ginkgo Forest', ja: 'イチョウの森', ko: '은행나무 숲' } },
```

| Field | Notes |
|---|---|
| `file` | basename in `images/`, without `.jpg`. Must match exactly. |
| `cat` | must match a `data-filter` value in `template.html` |
| `w`, `h` | pixel size. Only the ratio matters — it reserves the tile so layout does not shift while loading. |
| `demo` | always `true`. Every photo is meant to have `images/<file>_demo.jpg`, so the script writes it unconditionally: a missing shot then shows as a lightbox toggle that will not stick, rather than passing unnoticed. |
| `t` | display titles, one per language. All four are required — `main.js` reads `t[lang]` and falls back to an empty string, so a missing one renders an untitled tile and reports nothing. Escape any straight apostrophe as `\'`. |

Keep each row inside the matching category block. The blocks are only
comments, but the gallery renders in array order, so a row in the wrong
block appears out of group under "All".

### What updates itself

**Nothing else needs editing.** The total in the section heading and
the number on every filter button are computed from `PHOTOS` at
runtime (`js/main.js`). Add a row and every count updates.

The `—` in `<span id="photo-total">—</span>` is only a placeholder for
before the script runs.

---

## Adding a category

1. Add a button in `template.html`, inside the filter row:

   ```html
   <button type="button" data-filter="street" aria-pressed="false">{{filter.street}}</button>
   ```

2. Add that key to `i18n/strings.json`, in all four languages:

   ```json
   "filter.street": { "zh": "街拍", "en": "Street", "ja": "街", "ko": "거리" }
   ```

   The build aborts on a key that is used but undefined, or missing a
   language, so this step cannot be skipped silently.

3. Run `python3 tools/build.py`.

4. Use that same value as `cat` on the relevant rows in `js/photos.js`.

5. Optionally add a comment block in `photos.js` and group the rows
   under it, to keep the file readable.

No JavaScript or CSS changes. The count appears automatically, and
`main.js` hardcodes no category names — only `all`, for the show-all
button.

A category whose `cat` value is misspelled disappears from every
filter and only shows under "All", so check the spelling matches.

### Current categories

| Label | `cat` | Rule |
|---|---|---|
| 消磨 | `linger` | drinks, desserts, things on a table |
| 旅行 | `travel` | landscapes with an identifiable place |
| 氛圍 | `mood` | no place name; light and atmosphere |

---

## Languages

Four languages ship as four static files. The structure exists once, in
`template.html`; the strings live once, in `i18n/strings.json`.

```
template.html  ──┐
                 ├──▶  tools/build.py  ──▶  index.html      zh-Hant
i18n/strings.json┘                          index-en.html
                                            index-ja.html
                                            index-ko.html
```

### Changing a string

Open `i18n/strings.json`, find the key, edit the value for the language
you want, then run `python3 tools/build.py`.

```json
"note3.title": {
  "zh": "附帶聲明",
  "en": "A note on rights",
  "ja": "権利についての注記",
  "ko": "권리에 관한 안내"
}
```

Values may contain inline HTML, which is how links sit mid-sentence:

```json
"note3.p": {
  "zh": "…請直接透過下方 <a class=\"jump\" href=\"#links\">Instagram、Threads</a> 聯絡…"
}
```

Strings that are English-only — the footer line, `Scroll`, `Collection`
— carry the same value in all four languages on purpose. That is not an
oversight, and the build does not treat them specially.

### Adding a language

1. Add the language code to `LANGS` and `OUT` in `tools/build.py`.
2. Add that code to every entry in `i18n/strings.json`, including
   `html.lang` and `lang.label`.
3. Add it to every `t` block in `js/photos.js`.
4. Extend the `LANG` mapping near the top of `js/main.js`.
5. Run the build. The language switcher in the footer picks it up
   automatically — it is generated from `strings.json`.

The build refuses to write anything if a key is missing a language, is
used in the template but undefined, or is defined but never used. Read
the error rather than working around it.

### Photo titles

Titles live in `js/photos.js` under `t`, not in `strings.json`:

```js
{ file: 'ginkgo_forest', cat: 'mood', w: 909, h: 1600, demo: true,
  t: { zh: '銀杏森林', en: 'Ginkgo Forest', ja: 'イチョウの森', ko: '은행나무 숲' } },
```

Tiles show `t[lang]` over `t.en`. On the English page the two would be
identical, so only one line is rendered.

### Watch for, when translating

Layout was originally tuned to Chinese string lengths, and other
languages break it in two specific places:

| Where | Why |
|---|---|
| `hero.tagline` | Display type with a single-line budget. A wrap leaves one orphan character. Measured text widths sit well under the cap, but check after editing. |
| Nav labels | The labels occupy layout width even while transparent, so a long label widens the nav and eats into content. English is the widest at 118px; `--nav-space` in `css/style.css` is sized for it. |

---

## Editing copy

| What | Where |
|---|---|
| Any visible text | `i18n/strings.json`, then run the build |
| Page structure | `template.html` — search for `★ EDIT` |
| Photo titles and categories | `js/photos.js` |
| Colours, fonts, animation timing | `css/style.css` — the `:root` block |
| Your portrait | replace `images/me.jpg`, square crop, ~600×600 |

To remove a whole section, delete its `<section>` from `template.html`
and the matching `<a href="#id">` in the nav.

---

## Deploying to GitHub Pages, without git

All from the browser.

1. **New repository**. Name it anything; choose **Public** (Pages
   needs it on free accounts). Do not add a README or `.gitignore`.
2. On the empty repo, click **uploading an existing file**.
3. Select the **contents** of this folder — all four `index*.html`
   files, `css`, `js`, `images`, plus `template.html`, `i18n`, `tools`
   and `README.md` — not the folder itself.
4. **Commit changes.**
5. **Settings → Pages → Source → Deploy from a branch**, pick `main`
   and `/ (root)`, then **Save**.
6. Wait a minute or two. The URL appears at the top of that page.

| Repository name | URL |
|---|---|
| `rain_u` | `https://<user>.github.io/rain_u/` |
| `<user>.github.io` | `https://<user>.github.io/` |

Every path here is relative, so both work with no changes.

### Limits worth knowing

- The web uploader takes **100 files at a time**, 25 MB per file.
  This project is over 100 files, so **upload in two passes** —
  `images/` first, then everything else.
- The language switcher links to `index-en.html` and friends by
  relative path, so all four must be uploaded together.
- If a change does not show up, it is almost always the browser cache.
  Try a private window or a hard reload.
- Enabling Pages for the first time can take a few minutes.

### Later edits

Find the file on GitHub, click the pencil, commit. Or use
**Add file → Upload files** to overwrite by name.

---

## Local preview

Opening `index.html` directly works. Closer to production:

```bash
cd rain_u.0
python3 -m http.server 8000
```

Then <http://localhost:8000>.

---

## How the animation works

Same idea as the HTML5 UP Hyperspace template, rewritten with native
APIs. No jQuery, and no `@keyframes` for the scroll reveals.

**1. Freeze animation while loading.** `<html class="preload">` makes
CSS set every `transition` to `none` (top of `css/style.css`). The
class is removed 80ms after `load`. This avoids animating while layout
is still settling, which is what separates polished from janky. A
2-second timer force-unlocks it in case a stalled image delays `load`.

**2. Elements start hidden and offset.** `.reveal` sits at
`opacity: 0` with `translateY(1.6em)`. Adding `.in` transitions it
back over 0.9s.

**3. IntersectionObserver adds the class.** `js/main.js` watches every
`.reveal`, fires at about 12% visible, and unobserves after playing.
Roughly ten lines, replacing the jQuery Scrollex plugin.

The `--d` custom property staggers elements so a row appears in
sequence. Gallery tiles compute their own delay, capped at 0.32s so
later tiles do not wait too long.

All of it is disabled under `prefers-reduced-motion`.
