#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Write an AVIF copy of every JPEG under images/

       node tools/avif.js <out-dir> [cache-dir]

   Run by the deploy workflow, not by hand. The repo only ever holds
   JPEGs — tools/optimize.sh and the admin page both write them, and
   a browser cannot encode AVIF, so the admin page could not produce
   these itself. Doing it at deploy time means every photo gets one
   however it arrived.

   js/main.js prefers the AVIF and falls back to the JPEG, so a
   missing file here costs bytes, not a broken image.

   Quality 65 was chosen by measurement, not by eye alone: encoded
   from the current JPEGs, it scores a mean SSIM of 0.987 against
   them (worst photo 0.968) at 38% fewer bytes. Below 60 the worst
   photos start to visibly soften. It is scored against the JPEG
   rather than the original because the JPEG is what visitors see
   today, and the brief was "no visible change".

   Encoding is slow (~1s a photo), so results are cached by content
   hash: <cache-dir>/<sha1 of the JPEG>-q<Q>.avif. The workflow keeps
   that directory between runs, so a deploy only encodes new or
   replaced photos. Changing Q changes every key, which is the point.

   Needs sharp. Pinned in the workflow so the encoder there is the
   one these numbers were measured with.
   ═══════════════════════════════════════════════════════════════ */

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const Q = 65;
const EFFORT = 4;   // aom speed/size trade-off; higher barely shrinks files and is much slower

const SRC = path.join(__dirname, '..', 'images');
const OUT = process.argv[2];
const CACHE = process.argv[3] || '';

if (!OUT) {
  console.error('Usage: node tools/avif.js <out-dir> [cache-dir]');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
if (CACHE) fs.mkdirSync(CACHE, { recursive: true });

(async () => {
  const jpgs = fs.readdirSync(SRC).filter(f => f.endsWith('.jpg')).sort();
  let encoded = 0, cached = 0, inBytes = 0, outBytes = 0;

  for (const f of jpgs) {
    const src = path.join(SRC, f);
    const dest = path.join(OUT, f.replace(/\.jpg$/, '.avif'));
    const buf = fs.readFileSync(src);
    const key = CACHE &&
      path.join(CACHE, crypto.createHash('sha1').update(buf).digest('hex') + '-q' + Q + '.avif');

    if (key && fs.existsSync(key)) {
      fs.copyFileSync(key, dest);
      cached++;
    } else {
      await sharp(buf).avif({ quality: Q, effort: EFFORT }).toFile(dest);
      if (key) fs.copyFileSync(dest, key);
      encoded++;
    }
    inBytes += buf.length;
    outBytes += fs.statSync(dest).size;
  }

  const mb = n => (n / 1048576).toFixed(1) + ' MB';
  console.log(`${jpgs.length} AVIF written (${encoded} encoded, ${cached} from cache)`);
  console.log(`JPEG ${mb(inBytes)} -> AVIF ${mb(outBytes)} ` +
              `(-${Math.round(100 - outBytes * 100 / inBytes)}%)`);
})().catch(e => { console.error(e); process.exit(1); });
