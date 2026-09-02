#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   rain_u.0 — consistency checks

       node tools/check.js

   Run in CI on every push. These are the invariants that no single
   file can enforce on its own, and that nothing else notices when
   they break — the failures are all quiet ones: a photo that renders
   untitled, a filter that matches nothing, a tile with no image.

   The first check is the load-bearing one. js/admin.js writes
   js/photos.js by regenerating it whole, so if its serialiser and the
   file ever disagree about format, the next save from the admin page
   rewrites lines nobody edited. The page warns about this at load
   time, but only once someone opens it; here it fails the build.
   ═══════════════════════════════════════════════════════════════ */

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const LANGS = ['zh', 'en', 'ja', 'ko'];
const RULE_WIDTH = 62;          /* must match admin.js */

let failures = [];
const fail = (msg) => failures.push(msg);

/* Pull the real functions out of admin.js rather than reimplementing
   them. A copy here would drift from the original and pass while the
   thing it is meant to guard was broken. Their bodies end at the
   first line that is exactly two spaces and a brace, which is how
   they are indented inside the module's closure. */
function lift(names) {
  const lines = read('js/admin.js').split('\n');
  const out = names.map((n) => {
    const i = lines.findIndex((l) => l.startsWith('  function ' + n + '('));
    if (i < 0) throw new Error('js/admin.js has no function ' + n);
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j] === '  }') return lines.slice(i, j + 1).join('\n');
    }
    throw new Error('could not find the end of ' + n);
  });
  return new Function('LANGS', 'RULE_WIDTH', 'state',
    out.join('\n') + '\nreturn {' + names.join(',') + '};');
}

const photosText = read('js/photos.js');
const tplText = read('template.html');
const strings = JSON.parse(read('i18n/strings.json'));

const make = lift(['parsePhotos', 'parseCats', 'parseDescs',
                   'esc', 'rule', 'serialize']);
const probe = make(LANGS, RULE_WIDTH, null);
const cut = photosText.indexOf('const PHOTOS = [');

const state = {
  photos: probe.parsePhotos(photosText),
  cats:   probe.parseCats(tplText, strings),
  descs:  probe.parseDescs(photosText),
  header: photosText.slice(0, cut + 'const PHOTOS = ['.length),
  footer: '];\n'
};
const api = make(LANGS, RULE_WIDTH, state);

/* ── 1. The admin page can rewrite photos.js without changing it ── */
const rebuilt = api.serialize();
if (rebuilt !== photosText) {
  const a = photosText.split('\n'), b = rebuilt.split('\n');
  const at = a.findIndex((l, i) => l !== b[i]) + 1;
  fail('js/admin.js no longer regenerates js/photos.js byte for byte — ' +
       'first difference at line ' + at + '.\n' +
       '      on disk: ' + JSON.stringify(a[at - 1]) + '\n' +
       '      rebuilt: ' + JSON.stringify(b[at - 1]) + '\n' +
       '      Saving from the admin page would rewrite untouched lines.');
}

/* ── 2. Every photo has all four titles ─────────────────────────── */
state.photos.forEach((p) => {
  const missing = LANGS.filter((l) => !(p.t && p.t[l] && p.t[l].trim()));
  if (missing.length) {
    fail(p.file + ' has no ' + missing.join(', ') + ' title — ' +
         'js/main.js falls back to an empty string, so that language ' +
         'renders an untitled tile and says nothing about it.');
  }
});

/* ── 3. Photos and images agree ─────────────────────────────────── */
const named = new Set(state.photos.map((p) => p.file));
const onDisk = new Set();
fs.readdirSync(path.join(ROOT, 'images')).forEach((f) => {
  if (f === 'me.jpg' || !f.endsWith('.jpg')) return;
  onDisk.add(f.endsWith('_demo.jpg') ? f.slice(0, -'_demo.jpg'.length)
                                     : f.slice(0, -'.jpg'.length));
});
[...named].filter((f) => !onDisk.has(f)).forEach((f) => {
  fail(f + ' is in js/photos.js but images/' + f + '.jpg is not — ' +
       'the gallery shows a "missing file" tile.');
});
[...onDisk].filter((f) => !named.has(f)).forEach((f) => {
  fail('images/' + f + '.jpg is not in js/photos.js — nothing links to ' +
       'it and nothing will delete it.');
});
state.photos.filter((p) => p.demo).forEach((p) => {
  const demo = path.join(ROOT, 'images', p.file + '_demo.jpg');
  if (!fs.existsSync(demo)) {
    fail(p.file + ' is marked demo: true but has no _demo.jpg — the ' +
         'lightbox offers a wallpaper toggle that will not stick.');
  }
});

/* ── 4. Categories line up across all three files ───────────────── */
const inTemplate = [...tplText.matchAll(/data-filter="(\w+)"/g)]
  .map((m) => m[1]).filter((c) => c !== 'all');
const inStrings = Object.keys(strings)
  .filter((k) => k.startsWith('filter.') && k !== 'filter.all')
  .map((k) => k.slice('filter.'.length));
const inBlocks = [...photosText.matchAll(/\/\/ ── (\w+) —/g)].map((m) => m[1]);

const compare = (a, b, what) => {
  a.filter((x) => !b.includes(x)).forEach((x) => fail(what + ': ' + x));
};
compare(inTemplate, inStrings, 'a filter button with no name in i18n/strings.json');
compare(inStrings, inTemplate, 'a filter.* string with no button in template.html');
compare(inTemplate, inBlocks, 'a category with no block in js/photos.js');
compare(inBlocks, inTemplate, 'a block in js/photos.js with no filter button');

state.photos.forEach((p) => {
  if (!inTemplate.includes(p.cat)) {
    fail(p.file + " is in category '" + p.cat + "', which no filter " +
         'button matches — it appears only under "All".');
  }
});

/* ── Report ─────────────────────────────────────────────────────── */
if (failures.length) {
  console.error('\n' + failures.length + ' problem' +
                (failures.length > 1 ? 's' : '') + ':\n');
  failures.forEach((f) => console.error('  - ' + f + '\n'));
  process.exit(1);
}
console.log('  photos.js round-trips unchanged');
console.log('  ' + state.photos.length + ' photos, all four titles present');
console.log('  images and photos.js agree, both directions');
console.log('  ' + inTemplate.length + ' categories consistent across three files');
