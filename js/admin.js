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
  var state = null;     /* { photos, sha, cats, descs, header, footer } */
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

  function getFile(path) {
    /* Cache-bust: the API is CDN-fronted and will otherwise happily
       hand back the version from before your last save. */
    return api('/repos/' + REPO + '/contents/' + path +
               '?ref=' + BRANCH + '&t=' + Date.now())
      .then(function (d) {
        return { text: decodeB64(d.content), sha: d.sha };
      });
  }

  function putFile(path, text, sha, message) {
    return api('/repos/' + REPO + '/contents/' + path, {
      method: 'PUT',
      body: JSON.stringify({
        message: message,
        content: encodeB64(text),
        sha: sha,
        branch: BRANCH
      })
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
      getFile('js/photos.js'),
      getFile('template.html'),
      getFile('i18n/strings.json')
    ]).then(function (r) {
      var photosFile = r[0], tpl = r[1], strings = r[2];
      var text = photosFile.text;
      var cut = text.indexOf('const PHOTOS = [');

      state = {
        photos: parsePhotos(text),
        sha:    photosFile.sha,
        cats:   parseCats(tpl.text, JSON.parse(strings.text)),
        descs:  parseDescs(text),
        header: text.slice(0, cut + 'const PHOTOS = ['.length),
        footer: '];\n'
      };

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

    var img = document.createElement('img');
    img.className = 'row__thumb';
    img.src = 'images/' + p.file + '.jpg';
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
      o.textContent = c.t.zh;
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

    putFile('js/photos.js', serialize(), state.sha,
            'Update the gallery from the admin page')
      .then(function (res) {
        state.sha = res.content.sha;      /* so a second save still works */
        setDirty(false);
        setState('');
        toast('Saved. The site updates in about a minute.', 'ok');
      })
      .catch(function (e) {
        setState('');
        $('save').disabled = false;
        if (e.status === 409) {
          toast('Save rejected: the repo changed since this page loaded. ' +
                'Reload to pick up the new version, then redo the edit.', 'bad', 0);
        } else {
          toast('Save failed: ' + e.message, 'bad', 0);
        }
      });
  }

  /* ── Chrome ───────────────────────────────────────────────── */
  function setDirty(v) {
    dirty = v;
    $('save').disabled = !v;
    $('state').textContent = v ? 'Unsaved changes' : '';
    $('state').classList.toggle('is-dirty', v);
  }

  function setState(msg) { if (!dirty) $('state').textContent = msg; }

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
