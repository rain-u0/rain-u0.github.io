/* ═══════════════════════════════════════════════════════════════
   rain_u.0 — admin

   Edits the repo through the GitHub API. Three things are worth
   knowing before reading on:

   1. The token is the whole of the access control. It is never in
      this file or the repo; the operator pastes it and GitHub
      enforces it server-side. A stolen copy of this page is inert.

   2. js/photos.js is both what the site loads and what this edits.
      It is read by evaluating it — it is our own file, fetched over
      HTTPS from our own repo — and written by regenerating it whole
      from the array, preserving the header and the category blocks.

   3. Every write carries the blob SHA the file had when it was
      loaded. If anything changed in between — a push from a laptop,
      a second tab — GitHub rejects the write rather than letting one
      edit erase the other.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var REPO   = 'rain-u0/rain-u0.github.io';
  var BRANCH = 'main';
  var API    = 'https://api.github.com';
  var LANGS  = ['zh', 'en', 'ja', 'ko'];

  /* Width the category rules in js/photos.js are padded to. Matching
     it keeps a regenerated file byte-identical to a hand-edited one
     where nothing actually changed. */
  var RULE_WIDTH = 62;

  var token = null;
  var state = null;     /* { photos, head, cats, descs, header, footer } */
  var dirty = false;

  var $ = function (id) { return document.getElementById(id); };

  /* ── Base64 ────────────────────────────────────────────────
     atob and btoa work in bytes, not characters. Everything here
     is full of CJK, so both directions go through TextEncoder /
     TextDecoder or the titles come back as mojibake. */
  function decodeB64(b64) {
    var bin = atob(b64.replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  function encodeB64(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = '';
    /* Chunked: String.fromCharCode.apply blows the argument limit
       somewhere around 100k, and photos.js is heading that way. */
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  /* ── Images ────────────────────────────────────────────────
     What tools/optimize.sh does on a laptop, done here instead. Not a
     port of it: sips and qlmanage are macOS binaries and no browser
     has an equivalent, so this reaches the same four requirements —
     JPEG, long edge capped, orientation applied, dimensions known —
     by different means, and the bytes it produces will not match.

     HEIC is refused rather than decoded. Doing it in a browser costs a
     two-megabyte WebAssembly decoder for a case that mostly does not
     arise: phones convert on upload, and the laptop script handles the
     originals natively. Saying so plainly beats failing quietly. */
  var MAX_EDGE = 1600;
  var JPEG_QUALITY = 0.82;
  var ACCEPT_EXT = /\.(jpe?g|png|webp)$/i;
  var ACCEPT_LABEL = 'JPG, PNG or WebP';

  /* Extension first, because it is instant and usually right. */
  function checkName_(file) {
    if (ACCEPT_EXT.test(file.name)) return null;
    if (/\.hei[cf]$/i.test(file.name)) return heicMsg(file.name);
    return file.name + ' is not a supported format. Use ' + ACCEPT_LABEL + '.';
  }

  function heicMsg(name) {
    return name + ' is HEIC, which browsers cannot read. Convert it ' +
           'first, or add it with tools/optimize.sh, which handles HEIC ' +
           'natively.';
  }

  /* Then the bytes, because the extension is a claim and not always a
     true one. A HEIC renamed to .jpg passes the check above and then
     fails to decode with nothing useful to say; the container tells
     the truth. Both formats announce themselves in the first dozen
     bytes: JPEG with FF D8 FF, and the ISO base media family — which
     HEIC belongs to — with "ftyp" at offset 4 and its brand after. */
  function sniff(file) {
    return file.slice(0, 16).arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf);
      var ascii = function (from, to) {
        return String.fromCharCode.apply(null, b.subarray(from, to));
      };
      if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return null;      /* JPEG */
      if (ascii(1, 4) === 'PNG') return null;
      if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return null;
      if (ascii(4, 8) === 'ftyp') {
        var brand = ascii(8, 12);
        if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand)) return heicMsg(file.name);
        return file.name + ' is a ' + brand + ' video or image container, ' +
               'not a still image. Use ' + ACCEPT_LABEL + '.';
      }
      return file.name + ' does not look like ' + ACCEPT_LABEL +
             ' inside, whatever it is named.';
    }).catch(function () { return null; });   /* unreadable: let decode decide */
  }

  /* Same rules as the shell script: lower case, ASCII only. */
  function sanitize(name) {
    return folded(name)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /* Extension off, accents decomposed and their marks removed, so
     café becomes cafe rather than caf_. */
  function folded(name) {
    return name.replace(/\.[^.]+$/, '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /* Characters that survive folding but are not ASCII do not fold —
     they vanish. "tesr測圖" sanitises to "tesr", which is a valid
     filename and half the name the operator typed, with nothing to
     say the other half is gone. Report them rather than silently
     dropping them; an empty result is the same fault, total. */
  function droppedFrom(name) {
    var out = [];
    folded(name).split('').forEach(function (ch) {
      if (ch.charCodeAt(0) > 127 && out.indexOf(ch) === -1) out.push(ch);
    });
    return out;
  }

  function processImage(file) {
    /* Decoded once. Calling createImageBitmap twice on the same blob —
       once to measure, once to resize — leaves the second call pending
       forever, and a promise that never settles cannot be caught: the
       upload simply stops with no error to show. So measure and resize
       from the one bitmap.

       Reducing in halves rather than in a single draw. Canvas samples
       a fixed neighbourhood, so taking 3800px down to 1600px in one
       step skips most of the pixels and aliases; halving until the
       last step is under 2x keeps them. */
    return createImageBitmap(file, { imageOrientation: 'from-image' })
      .then(function (src) {
        var scale = Math.min(1, MAX_EDGE / Math.max(src.width, src.height));
        var w = Math.round(src.width * scale);
        var h = Math.round(src.height * scale);

        var from = src, fw = src.width, fh = src.height;
        while (fw > w * 2) {
          fw = Math.max(w, Math.round(fw / 2));
          fh = Math.max(h, Math.round(fh / 2));
          from = draw(from, fw, fh);
        }

        var out = draw(from, w, h);
        return new Promise(function (resolve, reject) {
          out.toBlob(function (blob) {
            if (blob) resolve({ blob: blob, w: w, h: h });
            else reject(new Error('could not encode ' + file.name));
          }, 'image/jpeg', JPEG_QUALITY);
        });
      });
  }

  function draw(source, w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    return c;
  }

  function blobToB64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = function () { reject(new Error('could not read blob')); };
      fr.readAsDataURL(blob);
    });
  }

  /* ── GitHub API ───────────────────────────────────────────── */
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, opts.headers || {});
    return fetch(API + path, opts).then(function (r) {
      if (r.status === 204) return null;
      return r.json().then(function (body) {
        if (!r.ok) {
          var err = new Error(body.message || ('HTTP ' + r.status));
          err.status = r.status;
          throw err;
        }
        return body;
      });
    });
  }

  /* fetch cannot report how much of a request body has gone out —
     there is no event for it — so the one call where that matters,
     uploading an image, goes through XMLHttpRequest instead. Its
     upload.onprogress is what every progress bar was built on before
     fetch existed. Everything else stays on fetch: those bodies are a
     few KB of JSON and finish in one go. */
  function postWithProgress(path, body, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API + path);
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.setRequestHeader('Accept', 'application/vnd.github+json');
      xhr.setRequestHeader('X-GitHub-Api-Version', '2022-11-28');
      xhr.setRequestHeader('Content-Type', 'application/json');

      xhr.upload.addEventListener('progress', function (e) {
        if (e.lengthComputable) onProgress(e.loaded);
      });

      xhr.onload = function () {
        var data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
        var err = new Error(data.message || ('HTTP ' + xhr.status));
        err.status = xhr.status;
        reject(err);
      };
      xhr.onerror = function () { reject(new Error('network error')); };
      xhr.send(body);
    });
  }

  function getFile(path) {
    /* Cache-bust: the API is CDN-fronted and will otherwise happily
       hand back the version from before your last save. */
    return api('/repos/' + REPO + '/contents/' + path +
               '?ref=' + BRANCH + '&t=' + Date.now())
      .then(function (d) {
        return { text: decodeB64(d.content), sha: d.sha };
      });
  }

  /* ── Committing ────────────────────────────────────────────
     Writes go through the git data API rather than the contents API,
     which can only touch one file per call. Adding a photo is three
     files — the image, the wallpaper shot, and the row that points at
     them — and three separate calls means three commits and a window
     in which two of them have landed and the third has not. Here the
     whole change is one tree and one commit, or it is nothing.

     The parent is the head as it was when this page loaded, so a push
     from anywhere else in between makes this commit a non-fast-forward
     and GitHub refuses it. That is the conflict check: it is enforced
     by the server, not by us remembering to look. */
  function getHead() {
    return api('/repos/' + REPO + '/git/ref/heads/' + BRANCH + '?t=' + Date.now())
      .then(function (r) { return r.object.sha; });
  }

  function commit(writes, deletes, message) {
    var parent = state.head;
    /* Set once the bodies are built. The later steps read it too, so
       a text-only save never flashes the ring on its way past 94%. */
    var ringing = false;

    return api('/repos/' + REPO + '/git/commits/' + parent)
      .then(function (c) {
        var baseTree = c.tree.sha;

        /* Blobs first: a tree entry needs a sha, and base64 is the only
           encoding that survives a JPEG intact.

           The bodies are built up front so their total size is known
           before the first byte goes out — a percentage needs a
           denominator. Each upload reports against its own share, and
           the ring shows the sum. */
        var bodies = writes.map(function (w) {
          return JSON.stringify({
            content: w.b64 != null ? w.b64 : encodeB64(w.text),
            encoding: 'base64'
          });
        });
        var total = bodies.reduce(function (n, b) { return n + b.length; }, 0);
        var sent = bodies.map(function () { return 0; });
        ringing = writes.some(function (w) { return w.b64 != null; });

        if (ringing) progress(0);

        return Promise.all(bodies.map(function (body, i) {
          return postWithProgress('/repos/' + REPO + '/git/blobs', body,
            function (loaded) {
              sent[i] = loaded;
              if (!ringing) return;
              var done = sent.reduce(function (a, b) { return a + b; }, 0);
              /* Capped short of full: the tree, the commit and the ref
                 update are still to come, and a ring sitting at 100%
                 while requests are outstanding is a lie. */
              progress(0.9 * done / total);
            }
          ).then(function (b) {
            return { path: writes[i].path, mode: '100644', type: 'blob', sha: b.sha };
          });
        })).then(function (entries) {
          /* A null sha on an existing path is how the tree API spells
             deletion.

             Anything also being written is dropped from the list. The
             two can collide: delete a photo, then add another under
             the same name — which the duplicate check allows, the name
             being free again — and the path lands in both. Deletions
             are appended, so the delete would win and the file would
             be uploaded and then removed in the same commit, leaving a
             row pointing at nothing. */
          var written = {};
          entries.forEach(function (e) { written[e.path] = true; });
          (deletes || []).forEach(function (path) {
            if (written[path]) return;
            entries.push({ path: path, mode: '100644', type: 'blob', sha: null });
          });
          return api('/repos/' + REPO + '/git/trees', {
            method: 'POST',
            body: JSON.stringify({ base_tree: baseTree, tree: entries })
          });
        });
      })
      .then(function (tree) {
        if (ringing) progress(0.94);
        return api('/repos/' + REPO + '/git/commits', {
          method: 'POST',
          body: JSON.stringify({
            message: message,
            tree: tree.sha,
            parents: [parent]
          })
        });
      })
      .then(function (c) {
        if (ringing) progress(0.97);
        return api('/repos/' + REPO + '/git/refs/heads/' + BRANCH, {
          method: 'PATCH',
          body: JSON.stringify({ sha: c.sha })   /* force defaults to false */
        }).then(function () {
          if (ringing) progress(1);
          state.head = c.sha;
          return c;
        });
      });
  }

  /* ── Parsing ───────────────────────────────────────────────
     photos.js is a module we generate ourselves, so rather than
     writing a parser for it, run it. The alternative is a regex
     over quoted CJK with escaped apostrophes, which is exactly the
     kind of thing that works until it silently does not. */
  function parsePhotos(text) {
    var body = text.replace(/^\s*const\s+PHOTOS\s*=/m, 'return');
    return new Function(body + '\n')();
  }

  /* Category order is the order of the filter buttons, which is the
     order they appear in on the site. strings.json holds the labels. */
  function parseCats(templateText, strings) {
    var out = [];
    var re = /data-filter="(\w+)"/g, m;
    while ((m = re.exec(templateText))) {
      if (m[1] === 'all') continue;          /* not a category */
      var entry = strings['filter.' + m[1]];
      /* All four, in the same order as a photo's titles. These are the
         same kind of thing — a name the site shows, once per language —
         and showing a subset here would just raise the question of
         which subset. */
      out.push({
        key: m[1],
        t: entry || { zh: m[1], en: m[1], ja: m[1], ko: m[1] }
      });
    }
    return out;
  }

  /* The one-line description in each category rule exists only in
     that comment. Keep it so a regenerated file does not lose it. */
  function parseDescs(text) {
    var out = {}, re = /\/\/ ── (\w+) — (.+?) ─/g, m;
    while ((m = re.exec(text))) out[m[1]] = m[2].trim();
    return out;
  }

  /* ── Serialising ──────────────────────────────────────────── */
  function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  function rule(key, desc) {
    var head = '  // ── ' + key + ' — ' + desc + ' ';
    while (head.length < RULE_WIDTH) head += '─';
    return head;
  }

  function serialize() {
    var lines = [];
    state.cats.forEach(function (cat, i) {
      if (i) lines.push('');
      lines.push(rule(cat.key, state.descs[cat.key] || cat.t.en));
      state.photos.filter(function (p) { return p.cat === cat.key; })
        .forEach(function (p) {
          lines.push(
            "  { file: '" + esc(p.file) + "', cat: '" + esc(p.cat) +
            "', w: " + p.w + ", h: " + p.h + ", demo: " + (p.demo ? 'true' : 'false') + ",");
          lines.push(
            "    t: { " + LANGS.map(function (l) {
              return l + ": '" + esc(p.t[l]) + "'";
            }).join(', ') + " } },");
        });
    });
    return state.header + '\n' + lines.join('\n') + '\n' + state.footer;
  }

  /* ── Load ─────────────────────────────────────────────────── */
  function loadAll() {
    setState('Loading…');
    return Promise.all([
      getHead(),
      getFile('js/photos.js'),
      getFile('template.html'),
      getFile('i18n/strings.json')
    ]).then(function (r) {
      var head = r[0], photosFile = r[1], tpl = r[2], strings = r[3];
      var text = photosFile.text;
      var cut = text.indexOf('const PHOTOS = [');

      state = {
        photos: parsePhotos(text),
        head:   head,
        /* Kept as text, not as parsed structures. Adding a category
           touches two files that are hand-aligned and full of comments;
           re-emitting them from a parse would reformat everything and
           bury a one-line change in a whole-file diff. */
        tplText:     tpl.text,
        stringsText: strings.text,
        tplDirty:     false,
        stringsDirty: false,
        /* Images processed in this session but not yet committed, and
           images the next save should remove. Both ride along with the
           photos.js write so the tree is never half-updated. */
        pending: {},
        removed: [],
        catsAdded: [],
        catsRemoved: [],
        /* Filenames whose images are, or are about to be, in the repo.
           Deleting one has to remove its files; deleting anything else
           only drops it from the queue.

           This used to be read off `pending`, which clears on save
           success — so a photo deleted between sending a save and its
           reply looked like it had never been committed, and its
           images stayed behind with no row pointing at them. Entries
           land here when a save is sent, not when it returns. */
        known: {},
        cats:   parseCats(tpl.text, JSON.parse(strings.text)),
        /* One-line English descriptions for the rules in photos.js */
        descs:  parseDescs(text),
        header: text.slice(0, cut + 'const PHOTOS = ['.length),
        footer: '];\n'
      };
      state.photos.forEach(function (p) { state.known[p.file] = true; });

      /* A round trip that changes nothing must produce the same
         bytes. If it does not, the writer and the file have drifted
         and saving would rewrite far more than the operator edited. */
      if (serialize() !== text) {
        toast('Warning: regenerating this file does not reproduce it. ' +
              'Saving would rewrite more than you edited — do not save.', 'bad', 0);
      }

      setDirty(false);
      render();
      setState('');
    });
  }

  /* ── Render ───────────────────────────────────────────────── */
  function render() {
    var wrap = $('groups');
    wrap.textContent = '';

    state.cats.forEach(function (cat) {
      var list = state.photos.filter(function (p) { return p.cat === cat.key; });

      var sec = el('section', 'group');
      var head = el('div', 'group__head');
      head.appendChild(el('span', 'group__name',
        LANGS.map(function (l) { return cat.t[l]; }).join(' · ')));
      head.appendChild(el('span', 'group__key', cat.key));
      head.appendChild(el('span', 'group__n', list.length));

      var del = el('button', 'group__del', 'Delete');
      del.type = 'button';
      del.disabled = list.length > 0;
      del.title = list.length
        ? 'Move its ' + list.length + ' photo' + (list.length > 1 ? 's' : '') +
          ' elsewhere first — deleting the category would leave them ' +
          'matching no filter.'
        : 'Remove this category';
      del.addEventListener('click', function () {
        if (!confirm('Delete the category "' + cat.key + '"?\n\n' +
                     'Its filter button and its four names go too. ' +
                     'Nothing happens until you save.')) return;
        removeCategory(cat.key);
      });
      head.appendChild(del);
      sec.appendChild(head);

      list.forEach(function (p) { sec.appendChild(row(p, cat.key)); });
      wrap.appendChild(sec);
    });

    $('count').textContent = state.photos.length + ' photos · ' +
                             state.cats.length + ' categories';
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function row(p, catKey) {
    var r = el('div', 'row');
    r.dataset.file = p.file;
    r.dataset.cat = catKey;
    r.draggable = true;

    r.appendChild(el('div', 'row__grip', '⠿'));

    var pend = state.pending[p.file];
    if (pend) r.classList.add('is-new');

    var img = document.createElement('img');
    img.className = 'row__thumb';
    /* A pending photo is not on the site yet, so its thumbnail has to
       come from the blob in memory rather than a URL that 404s. */
    img.src = pend ? pend.preview : 'images/' + p.file + '.jpg';
    img.alt = '';
    img.loading = 'lazy';
    r.appendChild(img);

    var body = el('div', 'row__body');
    body.appendChild(el('div', 'row__file', p.file));

    var titles = el('div', 'titles');
    LANGS.forEach(function (lang) {
      var f = el('div', 'field');
      f.appendChild(el('span', 'field__lang', lang.toUpperCase()));
      var input = document.createElement('input');
      input.type = 'text';
      input.value = p.t[lang] || '';
      input.dataset.lang = lang;
      if (!input.value.trim()) input.classList.add('is-empty');
      input.addEventListener('input', function () {
        p.t[lang] = input.value;
        input.classList.toggle('is-empty', !input.value.trim());
        setDirty(true);
      });
      f.appendChild(input);
      titles.appendChild(f);
    });
    body.appendChild(titles);
    r.appendChild(body);

    var side = el('div', 'row__side');
    var sel = el('select', 'row__cat');
    state.cats.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.key;
      /* The key, not a name: this picker sets p.cat, and showing the
         value it sets leaves nothing to infer. The heading above the
         block carries the four names for anyone who needs them. */
      o.textContent = c.key;
      if (c.key === p.cat) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      /* Moving category means moving block, and the blocks are the
         render order — so send it to the end of the new one rather
         than leaving it wherever it sat in the old. */
      p.cat = sel.value;
      state.photos.splice(state.photos.indexOf(p), 1);
      state.photos.push(p);
      setDirty(true);
      render();
    });
    side.appendChild(sel);

    var del = el('button', 'row__del', 'Delete');
    del.type = 'button';
    del.addEventListener('click', function () {
      if (!confirm('Delete ' + p.file + '? Both its images go too.\n\n' +
                   'Nothing happens until you save.')) return;
      state.photos.splice(state.photos.indexOf(p), 1);
      delete state.pending[p.file];
      if (state.known[p.file]) {
        state.removed.push('images/' + p.file + '.jpg',
                           'images/' + p.file + '_demo.jpg');
        delete state.known[p.file];
      }
      setDirty(true);
      render();
    });
    side.appendChild(del);

    r.appendChild(side);

    wireDrag(r, p);
    return r;
  }

  /* ── Reordering ───────────────────────────────────────────── */
  var dragging = null;

  function wireDrag(r, p) {
    r.addEventListener('dragstart', function (e) {
      dragging = p;
      r.classList.add('is-drag');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', p.file);
    });
    r.addEventListener('dragend', function () {
      dragging = null;
      r.classList.remove('is-drag');
      document.querySelectorAll('.row.is-over').forEach(function (n) {
        n.classList.remove('is-over');
      });
    });
    r.addEventListener('dragover', function (e) {
      /* Only within a category: the blocks are homogeneous, and a
         cross-block drop would be a category change wearing the
         wrong gesture. That is what the dropdown is for. */
      if (!dragging || dragging === p || dragging.cat !== p.cat) return;
      e.preventDefault();
      r.classList.add('is-over');
    });
    r.addEventListener('dragleave', function () { r.classList.remove('is-over'); });
    r.addEventListener('drop', function (e) {
      if (!dragging || dragging === p || dragging.cat !== p.cat) return;
      e.preventDefault();
      var from = state.photos.indexOf(dragging);
      state.photos.splice(from, 1);
      state.photos.splice(state.photos.indexOf(p), 0, dragging);
      setDirty(true);
      render();
    });
  }

  /* ── Save ─────────────────────────────────────────────────── */
  function validate() {
    var bad = state.photos.filter(function (p) {
      return LANGS.some(function (l) { return !(p.t[l] || '').trim(); });
    });
    return bad;
  }

  /* Say what the commit did, since one save can add, remove and edit
     in the same breath and "update the gallery" tells a later reader
     nothing. */
  function commitMessage() {
    var bits = [];
    var added = Object.keys(state.pending).length;
    if (added) bits.push('add ' + added + ' photo' + (added > 1 ? 's' : ''));
    if (state.removed.length) {
      bits.push('remove ' + (state.removed.length / 2) + ' photo' +
                (state.removed.length > 2 ? 's' : ''));
    }
    if (state.catsAdded.length) {
      bits.push('add the ' + state.catsAdded.join(' and ') + ' category' +
                (state.catsAdded.length > 1 ? ' keys' : ''));
    }
    if (state.catsRemoved.length) {
      bits.push('remove the ' + state.catsRemoved.join(' and ') + ' category' +
                (state.catsRemoved.length > 1 ? ' keys' : ''));
    }
    if (!bits.length) return 'Update the gallery from the admin page';
    return bits.join(', ').replace(/^./, function (c) { return c.toUpperCase(); }) +
           ' from the admin page';
  }

  function save() {
    var bad = validate();
    if (bad.length) {
      toast(bad.length + ' photo' + (bad.length > 1 ? 's are' : ' is') +
            ' missing a title: ' +
            bad.slice(0, 3).map(function (p) { return p.file; }).join(', ') +
            (bad.length > 3 ? ' and others' : ''), 'bad');
      return;
    }

    $('save').disabled = true;
    setState('Saving…');

    var writes = [{ path: 'js/photos.js', text: serialize() }];
    if (state.tplDirty)     writes.push({ path: 'template.html',     text: state.tplText });
    if (state.stringsDirty) writes.push({ path: 'i18n/strings.json', text: state.stringsText });
    Object.keys(state.pending).forEach(function (file) {
      var p = state.pending[file];
      writes.push({ path: 'images/' + file + '.jpg',      b64: p.photoB64 });
      writes.push({ path: 'images/' + file + '_demo.jpg', b64: p.demoB64 });
      /* Marked before the request goes out. If it succeeds these files
         exist; if it fails the page must be reloaded anyway. */
      state.known[file] = true;
    });

    /* Snapshot what is going out. Clearing the queues wholesale on
       reply would discard anything added to them in the meantime —
       a photo deleted mid-save would lose its scheduled file removal
       and leave its images behind with no row pointing at them. */
    var sentRev     = rev;
    var sentPending = Object.keys(state.pending);
    var sentRemoved = state.removed.slice();
    var sentAdded   = state.catsAdded.slice();
    var sentGone    = state.catsRemoved.slice();
    var without = function (list, sent) {
      return list.filter(function (x) { return sent.indexOf(x) === -1; });
    };

    commit(writes, state.removed, commitMessage())
      .then(function () {
        sentPending.forEach(function (f) { delete state.pending[f]; });
        state.removed     = without(state.removed, sentRemoved);
        state.catsAdded   = without(state.catsAdded, sentAdded);
        state.catsRemoved = without(state.catsRemoved, sentGone);

        if (rev === sentRev) {
          state.tplDirty = false;
          state.stringsDirty = false;
          setDirty(false);
          toast('Saved. The site updates in about a minute.', 'ok');
        } else {
          toast('Saved — but you edited while it was saving, so there ' +
                'is more to save.', 'ok');
        }
        setState('');
        progress(null);
        render();
      })
      .catch(function (e) {
        setState('');
        progress(null);
        $('save').disabled = false;
        /* 409 from the contents API, 422 from a non-fast-forward ref
           update — the same situation reported two ways. */
        if (e.status === 409 || e.status === 422) {
          toast('Save rejected: the repo changed since this page loaded. ' +
                'Reload to pick up the new version, then redo the edit.', 'bad', 0);
        } else {
          toast('Save failed: ' + e.message, 'bad', 0);
        }
      });
  }

  /* ── Add a photo ───────────────────────────────────────────
     Nothing here touches the repo. The sheet processes both images,
     puts a row in the list and parks the JPEGs in state.pending; the
     save that follows is what writes them, in the same commit as the
     row that refers to them. */
  var slots = { photo: null, demo: null };

  function resetSheet() {
    ['photo', 'demo'].forEach(function (k) {
      if (slots[k]) URL.revokeObjectURL(slots[k].preview);
      slots[k] = null;
      var d = $('drop-' + k);
      d.classList.remove('is-set');
      d.querySelector('.drop__slot').style.backgroundImage = '';
      d.querySelector('input').value = '';
    });
    $('new-name').value = '';
    $('new-name').classList.remove('is-bad');
    $('name-note').textContent = '';
    $('name-note').classList.remove('is-bad');
    $('sheet-err').hidden = true;

    var t = $('new-titles');
    t.textContent = '';
    LANGS.forEach(function (lang) {
      var f = el('div', 'field');
      f.appendChild(el('span', 'field__lang', lang.toUpperCase()));
      var i = document.createElement('input');
      i.type = 'text';
      i.dataset.lang = lang;
      f.appendChild(i);
      t.appendChild(f);
    });

    var sel = $('new-cat');
    sel.textContent = '';
    state.cats.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.key;
      o.textContent = c.key;
      sel.appendChild(o);
    });
  }

  function takeFile(kind, file) {
    if (!file) return;
    var bad = checkName_(file);
    if (bad) { sheetErr(bad); return; }
    sheetErr(null);

    var d = $('drop-' + kind);
    d.querySelector('.drop__cap').textContent = 'Processing…';

    sniff(file).then(function (wrong) {
      if (wrong) throw new Error(wrong);
      return processImage(file);
    }).then(function (out) {
      return blobToB64(out.blob).then(function (b64) {
        if (slots[kind]) URL.revokeObjectURL(slots[kind].preview);
        slots[kind] = {
          b64: b64, w: out.w, h: out.h,
          preview: URL.createObjectURL(out.blob),
          kb: Math.round(out.blob.size / 1024)
        };
        d.classList.add('is-set');
        d.querySelector('.drop__slot').style.backgroundImage =
          'url("' + slots[kind].preview + '")';
        d.querySelector('.drop__cap').textContent =
          (kind === 'photo' ? 'Photo' : 'Wallpaper screenshot') +
          ' · ' + out.w + '×' + out.h + ' · ' + slots[kind].kb + ' KB';

        /* The name comes off the photo, not the screenshot: the
           screenshot is named after the photo, never the other way. */
        if (kind === 'photo' && !$('new-name').value) {
          $('new-name').value = sanitize(file.name);
          checkName();
        }
      });
    }).catch(function (e) {
      d.querySelector('.drop__cap').textContent =
        kind === 'photo' ? 'Photo' : 'Wallpaper screenshot';
      /* sniff already returns a whole sentence; a decode failure does
         not, and by then the format is the likeliest cause. */
      sheetErr(/\.$/.test(e.message) ? e.message
        : 'Could not read ' + file.name + '. If it is not ' +
          ACCEPT_LABEL + ', convert it first. (' + e.message + ')');
    });
  }

  function checkName() {
    var raw = $('new-name').value;
    var clean = sanitize(raw);
    var note = $('name-note'), input = $('new-name');
    var problem = null;

    var dropped = droppedFrom(raw);

    if (!raw.trim()) {
      problem = null;                       /* not filled in yet */
    } else if (dropped.length) {
      problem = 'Remove ' + dropped.join(' ') + ' — GitHub Pages matches ' +
                'paths byte for byte, so a filename has to be ASCII. ' +
                (clean ? 'Dropping ' + (dropped.length > 1 ? 'them' : 'it') +
                         ' would leave "' + clean + '".'
                       : 'Nothing would be left.');
    } else if (!clean) {
      problem = 'That name has no letters or digits a URL can carry.';
    } else if (state.photos.some(function (p) { return p.file === clean; })) {
      problem = clean + ' already exists.';
    }

    input.classList.toggle('is-bad', !!problem);
    note.classList.toggle('is-bad', !!problem);
    note.textContent = problem ||
      (clean ? 'images/' + clean + '.jpg and images/' + clean + '_demo.jpg' : '');
    return problem ? null : clean;
  }

  function sheetErr(msg) {
    $('sheet-err').textContent = msg || '';
    $('sheet-err').hidden = !msg;
  }

  function addPhoto() {
    if (!slots.photo || !slots.demo) {
      sheetErr('Both the photo and its wallpaper screenshot are required.');
      return;
    }
    var file = checkName();
    if (!file) {
      sheetErr($('new-name').value.trim()
        ? 'Fix the file name first.' : 'A file name is required.');
      return;
    }
    var t = {}, missing = [];
    $('new-titles').querySelectorAll('input').forEach(function (i) {
      t[i.dataset.lang] = i.value.trim();
      if (!i.value.trim()) missing.push(i.dataset.lang.toUpperCase());
    });
    if (missing.length) {
      sheetErr('Missing ' + missing.join(', ') + '. All four are required — ' +
               'a blank one renders an untitled tile on that language.');
      return;
    }

    var photo = {
      file: file,
      cat: $('new-cat').value,
      w: slots.photo.w,
      h: slots.photo.h,
      demo: true,
      t: t
    };
    state.pending[file] = {
      photoB64: slots.photo.b64,
      demoB64:  slots.demo.b64,
      preview:  slots.photo.preview
    };
    slots.photo = null;          /* the preview URL now belongs to the row */
    state.photos.push(photo);

    setDirty(true);
    render();
    $('sheet').hidden = true;
    toast('Added ' + file + '. Save to publish it.', 'ok');
  }

  function wireDrops() {
    ['photo', 'demo'].forEach(function (kind) {
      var d = $('drop-' + kind);
      var input = d.querySelector('input');
      input.addEventListener('change', function () { takeFile(kind, input.files[0]); });
      d.addEventListener('dragover', function (e) {
        e.preventDefault(); d.classList.add('is-over');
      });
      d.addEventListener('dragleave', function () { d.classList.remove('is-over'); });
      d.addEventListener('drop', function (e) {
        e.preventDefault();
        d.classList.remove('is-over');
        takeFile(kind, e.dataTransfer.files[0]);
      });
    });
    $('new-name').addEventListener('input', checkName);
    $('sheet-add').addEventListener('click', addPhoto);
    $('sheet-cancel').addEventListener('click', function () { $('sheet').hidden = true; });
    $('sheet').addEventListener('click', function (e) {
      if (e.target === $('sheet')) $('sheet').hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('sheet').hidden) $('sheet').hidden = true;
      if (!$('catsheet').hidden) $('catsheet').hidden = true;
    });
  }

  /* ── Categories ────────────────────────────────────────────
     A category is three things in three files: a filter button in
     template.html, a name per language in i18n/strings.json, and a
     rule comment in js/photos.js. All three move together or the
     build refuses — it rejects a key used without a definition and a
     definition never used — so a half-done edit fails loudly in CI
     instead of shipping a filter that shows nothing.

     Renaming is not offered. Changing the key would mean rewriting
     cat on every photo that uses it, and the key is never shown to a
     visitor, so the risk buys nothing.

     Both files are hand-aligned to their longest key. Inserting keeps
     that: pad to the current column, or re-pad every line if the new
     key is longer than any of them. */
  function filterColumn(keys) {
    return Math.max.apply(null, keys.map(function (k) { return k.length; })) + 1;
  }

  function addCategory(key, names, desc) {
    /* template.html — the button, appended after the last one */
    var line = '          <button type="button" data-filter="' + key + '" ' +
               'aria-pressed="false">{{filter.' + key + '}}</button>';
    state.tplText = state.tplText.replace(
      /([ \t]*<button type="button" data-filter="\w+"[\s\S]*?<\/button>\n)(?![\s\S]*?data-filter=)/,
      '$1' + line + '\n');

    /* i18n/strings.json — the four names */
    var jline = '  "filter.' + key + '": { ' + LANGS.map(function (l) {
      return '"' + l + '": ' + JSON.stringify(names[l]);
    }).join(', ') + ' },';
    state.stringsText = state.stringsText.replace(
      /(  "filter\.\w+":[^\n]*\n)(?!  "filter\.)/, '$1' + jline + '\n');

    /* js/photos.js — regenerated from state.cats, so this is enough */
    var t = {};
    LANGS.forEach(function (l) { t[l] = names[l]; });
    state.cats.push({ key: key, t: t });
    state.descs[key] = desc;
    state.catsAdded.push(key);

    realign();
    setDirty(true);
    render();
  }

  function removeCategory(key) {
    state.tplText = state.tplText.replace(
      new RegExp('[ \\t]*<button[^\\n]*data-filter="' + key + '"[^\\n]*\\n'), '');
    state.stringsText = state.stringsText.replace(
      new RegExp('  "filter\\.' + key + '":[^\\n]*\\n'), '');
    state.cats = state.cats.filter(function (c) { return c.key !== key; });
    delete state.descs[key];
    /* Added and removed in the same session cancels out — the commit
       should describe the net change, not the operator's path to it. */
    var i = state.catsAdded.indexOf(key);
    if (i !== -1) state.catsAdded.splice(i, 1);
    else state.catsRemoved.push(key);
    realign();
    setDirty(true);
    render();
  }

  /* Run after every add and remove rather than only when the column
     moves. Padding that is already right comes out unchanged, and
     doing it unconditionally is what makes removing a long key undo
     the widening that adding it caused. */
  function realign() {
    var col = filterColumn(['all'].concat(state.cats.map(function (c) {
      return c.key;
    })));
    state.tplText = repadTemplate(state.tplText, col);
    state.stringsText = repadStrings(state.stringsText, col + 'filter.'.length + 3);
    state.tplDirty = true;
    state.stringsDirty = true;
  }

  function repadTemplate(text, col) {
    return text.replace(/(data-filter="(\w+)")(\s+)(aria-pressed)/g,
      function (_, a, k, __, b) {
        return a + Array(col - k.length + 1).join(' ') + b;
      });
  }

  function repadStrings(text, col) {
    return text.replace(/^(  "filter\.\w+":)(\s+)(\{)/gm,
      function (_, a, __, b) {
        return a + Array(Math.max(1, col - a.length + 3)).join(' ') + b;
      });
  }

  /* ── The category sheet ────────────────────────────────── */
  function resetCatSheet() {
    $('cat-key').value = '';
    $('cat-key').classList.remove('is-bad');
    $('cat-note').textContent = '';
    $('cat-desc').value = '';
    $('cat-err').hidden = true;

    var box = $('cat-names');
    box.textContent = '';
    LANGS.forEach(function (lang) {
      var f = el('div', 'field');
      f.appendChild(el('span', 'field__lang', lang.toUpperCase()));
      var i = document.createElement('input');
      i.type = 'text';
      i.dataset.lang = lang;
      f.appendChild(i);
      box.appendChild(f);
    });
  }

  function checkCatKey() {
    var raw = $('cat-key').value;
    var clean = sanitize(raw);
    var dropped = droppedFrom(raw);
    var taken = ['all'].concat(state.cats.map(function (c) { return c.key; }));
    var problem = null;

    if (!raw.trim()) problem = null;
    else if (dropped.length) {
      problem = 'Remove ' + dropped.join(' ') + ' — a key goes in an HTML ' +
                'attribute and a JSON key, so it has to be ASCII.';
    } else if (!clean) problem = 'That leaves no key at all.';
    else if (taken.indexOf(clean) !== -1) problem = clean + ' is already a category.';

    $('cat-key').classList.toggle('is-bad', !!problem);
    $('cat-note').classList.toggle('is-bad', !!problem);
    $('cat-note').textContent = problem || (clean ? 'cat: \'' + clean + '\'' : '');
    return problem ? null : clean;
  }

  function submitCategory() {
    var key = checkCatKey();
    if (!key) {
      catErr($('cat-key').value.trim() ? 'Fix the key first.' : 'A key is required.');
      return;
    }
    var names = {}, missing = [];
    $('cat-names').querySelectorAll('input').forEach(function (i) {
      names[i.dataset.lang] = i.value.trim();
      if (!i.value.trim()) missing.push(i.dataset.lang.toUpperCase());
    });
    if (missing.length) {
      catErr('Missing ' + missing.join(', ') + '. The build refuses a string ' +
             'without all four, so this would fail rather than ship.');
      return;
    }
    var desc = $('cat-desc').value.trim();
    if (!desc) { catErr('The note is required — it becomes the comment in photos.js.'); return; }

    addCategory(key, names, desc);
    $('catsheet').hidden = true;
    toast('Added the category ' + key + '. Save to publish it.', 'ok');
  }

  function catErr(msg) {
    $('cat-err').textContent = msg || '';
    $('cat-err').hidden = !msg;
  }

  /* ── Chrome ───────────────────────────────────────────────── */
  /* Bumped by every edit. A save compares the value it saw when it was
     sent against the value on reply: if they differ, something was
     edited while the request was in the air and the page is still
     dirty, whatever the reply says. */
  var rev = 0;

  function setDirty(v) {
    if (v) rev++;
    dirty = v;
    $('save').disabled = !v;
    if (!busy) showState();
  }

  /* Work in progress outranks the dirty flag. Both are true while a
     save is in the air, and of the two "Saving…" is the one that
     answers the question the operator just asked by clicking. This
     used to be the other way round — the status only updated when
     nothing was dirty, so "Saving…" could never appear at all and a
     save looked like a button that did nothing for a second or two. */
  var busy = '';

  function setState(msg) {
    busy = msg;
    showState();
  }

  /* Called with 0..1 while a save carries images, and with null to put
     the ring away. Text-only saves never call it: they are over in the
     time the ring would take to draw, and a control that flashes says
     less than the word already sitting beside it. */
  function progress(p) {
    var ring = $('ring');
    if (p == null) {
      ring.hidden = true;
      ring.style.setProperty('--p', 0);
      return;
    }
    ring.hidden = false;
    ring.style.setProperty('--p', Math.max(0, Math.min(1, p)));
  }

  function showState() {
    var text = busy || (dirty ? 'Unsaved changes' : '');
    $('state').textContent = text;
    $('state').classList.toggle('is-dirty', !busy && dirty);
    $('state').classList.toggle('is-busy', !!busy);
  }

  var toastTimer;
  function toast(msg, kind, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast ' + (kind ? 'is-' + kind : '');
    t.hidden = false;
    requestAnimationFrame(function () { t.classList.add('show'); });
    clearTimeout(toastTimer);
    if (ms !== 0) {
      toastTimer = setTimeout(function () {
        t.classList.remove('show');
        setTimeout(function () { t.hidden = true; }, 300);
      }, ms || 3200);
    }
  }

  function signIn(t) {
    token = t;
    /* Prove the token before showing anything: a bad one should fail
       here, not on the first save after ten minutes of editing. */
    return api('/repos/' + REPO).then(function () {
      $('gate').hidden = true;
      $('app').hidden = false;
      return loadAll();
    });
  }

  /* Nothing to clear but the tab itself — the token was never
     written anywhere. Reloading guarantees a clean slate. */
  function signOut() { location.reload(); }

  /* ── Wire up ──────────────────────────────────────────────── */
  $('gate-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = $('token').value.trim();
    if (!t) return;
    $('gate-go').disabled = true;
    $('gate-err').hidden = true;
    signIn(t).catch(function (err) {
      $('gate-go').disabled = false;
      $('gate-err').textContent = err.status === 401
        ? 'That token is invalid or has been revoked.'
        : (err.status === 404
            ? 'The token is valid but cannot see this repository. Check its ' +
              'repository access and that Contents is set to read and write.'
            : ('Sign-in failed: ' + err.message));
      $('gate-err').hidden = false;
    });
  });

  wireDrops();
  $('add').addEventListener('click', function () {
    resetSheet();
    $('sheet').hidden = false;
  });
  $('add-cat').addEventListener('click', function () {
    resetCatSheet();
    $('catsheet').hidden = false;
  });
  $('cat-key').addEventListener('input', checkCatKey);
  $('cat-save').addEventListener('click', submitCategory);
  $('cat-cancel').addEventListener('click', function () { $('catsheet').hidden = true; });
  $('catsheet').addEventListener('click', function (e) {
    if (e.target === $('catsheet')) $('catsheet').hidden = true;
  });
  $('save').addEventListener('click', save);
  $('logout').addEventListener('click', signOut);
  $('reload').addEventListener('click', function () {
    if (dirty && !confirm('You have unsaved changes. Reloading discards them. Continue?')) return;
    setDirty(false);
    loadAll().catch(function (e) { toast('Load failed: ' + e.message, 'bad', 0); });
  });

  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

})();
