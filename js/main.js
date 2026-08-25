/* ═══════════════════════════════════════════════════════════════
   rain_u.0 — behaviour script. No external libraries.

   Four jobs:
     1. Release the load lock — drop <html class="preload"> so
        transitions start applying
     2. Scroll reveal — IntersectionObserver adds .in to .reveal
     3. Gallery — built from PHOTOS in js/photos.js, plus filtering
     4. Lightbox — click to enlarge, arrows to move, Esc to close,
        W to toggle the wallpaper preview
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Language ─────────────────────────────────────────────
     The page language comes from <html lang>, which tools/build.py
     stamps per generated file. UI strings for the current language
     are injected as window.I18N by the same build step, so this
     script stays language-agnostic. */
  var LANG = (function () {
    var l = (document.documentElement.lang || 'zh').toLowerCase();
    if (l.indexOf('zh') === 0) return 'zh';
    if (l.indexOf('ja') === 0) return 'ja';
    if (l.indexOf('ko') === 0) return 'ko';
    return 'en';
  })();

  var I18N = window.I18N || {};
  function t(key) { return I18N[key] || ''; }

  /* ── 1. Release the load lock ───────────────────────────── */
  /* Wait for load (images and fonts settled), then one more beat,
     so nothing animates while layout is still reflowing. This is
     the step that separates "polished" from "janky".            */
  window.addEventListener('load', function () {
    setTimeout(function () {
      document.documentElement.classList.remove('preload');
    }, 80);
  });

  /* Safety net: if a stalled image delays `load`, unlock anyway */
  setTimeout(function () {
    document.documentElement.classList.remove('preload');
  }, 2000);

  /* ── 2. Scroll reveal ───────────────────────────────────── */
  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      revealObserver.unobserve(entry.target);   // play once, then stop watching
    });
  }, {
    /* Fire at ~12% visible — roughly the moment you notice it */
    threshold: 0.12,
    /* Pull the bottom edge in by 8% so nothing finishes animating
       before it is properly in view */
    rootMargin: '0px 0px -8% 0px'
  });

  function watch(el) { revealObserver.observe(el); }

  document.querySelectorAll('.reveal').forEach(watch);

  /* ── 3. Gallery ─────────────────────────────────────────── */
  var galleryEl = document.getElementById('gallery');
  var filtersEl = document.getElementById('filters');

  /* PHOTOS comes from js/photos.js. Degrade instead of throwing
     if that file is missing. */
  var photos = (typeof PHOTOS !== 'undefined' && Array.isArray(PHOTOS)) ? PHOTOS : [];

  /* The currently visible list. The lightbox steps through this,
     so after filtering the arrow keys stay inside that category. */
  var visible = photos.slice();

  function buildShot(photo, index) {
    var btn = document.createElement('button');
    btn.className = 'shot reveal reveal--zoom';
    btn.type = 'button';
    btn.dataset.cat = photo.cat;
    btn.dataset.index = String(index);
    var titleMain = (photo.t && photo.t[LANG]) || '';
    var titleEn   = (photo.t && photo.t.en) || '';
    /* On the English page t[LANG] and t.en are the same string, so
       showing both would just duplicate the line. */
    var showEn    = LANG !== 'en' && titleEn && titleEn !== titleMain;

    btn.setAttribute('aria-label', titleMain + t('js.enlarge'));

    /* Stagger so tiles in a row appear in sequence. Capped at
       0.32s — without a cap, later tiles wait far too long.      */
    btn.style.setProperty('--d', Math.min(index % 8, 4) * 0.08 + 's');

    var ratio = (photo.w && photo.h) ? (photo.w / photo.h) : 0.7;

    var frame = document.createElement('div');
    frame.className = 'shot__frame';
    frame.style.setProperty('--ar', ratio.toFixed(4));

    var img = document.createElement('img');
    img.src = 'images/' + photo.file + '.jpg';
    img.alt = titleMain + (showEn ? ' ' + titleEn : '');
    img.loading = 'lazy';       /* native lazy loading */
    img.decoding = 'async';
    img.width = photo.w || 1200;
    img.height = photo.h || 1700;

    /* fade in and unblur only once decoded */
    img.addEventListener('load', function () { img.classList.add('loaded'); });

    /* If the file isn't in images/ yet, show a hint instead of a
       broken image */
    img.addEventListener('error', function () {
      img.classList.add('failed');
      img.removeAttribute('src');
      btn.classList.add('is-missing');
    });

    var missing = document.createElement('div');
    missing.className = 'shot__missing';
    missing.innerHTML = '<span></span><span></span>';
    missing.children[0].textContent = t('js.missing');
    missing.children[1].textContent = 'images/' + photo.file + '.jpg';

    var cap = document.createElement('div');
    cap.className = 'shot__cap';
    cap.innerHTML = '<b></b><small></small>';
    cap.querySelector('b').textContent = titleMain;
    if (showEn) cap.querySelector('small').textContent = titleEn;

    frame.appendChild(img);
    frame.appendChild(missing);
    btn.appendChild(frame);
    btn.appendChild(cap);

    btn.addEventListener('click', function () {
      openBox(visible.indexOf(photo));
    });

    return btn;
  }

  function renderGallery(list) {
    if (!galleryEl) return;
    galleryEl.textContent = '';
    visible = list;
    list.forEach(function (photo, i) {
      var shot = buildShot(photo, i);
      galleryEl.appendChild(shot);
      watch(shot);
    });
  }

  /* category filter buttons */
  if (filtersEl) {
    filtersEl.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-filter]');
      if (!btn) return;

      filtersEl.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });

      var cat = btn.dataset.filter;
      renderGallery(cat === 'all'
        ? photos.slice()
        : photos.filter(function (p) { return p.cat === cat; }));
    });

    /* Write each category's count into its button, so the numbers
       never need maintaining by hand */
    filtersEl.querySelectorAll('button[data-filter]').forEach(function (b) {
      var cat = b.dataset.filter;
      var n = cat === 'all'
        ? photos.length
        : photos.filter(function (p) { return p.cat === cat; }).length;
      var span = document.createElement('span');
      span.className = 'count';
      span.textContent = n;
      b.appendChild(span);
    });
  }

  renderGallery(photos.slice());

  /* Fill the total into the section heading */
  var totalEl = document.getElementById('photo-total');
  if (totalEl) totalEl.textContent = photos.length;

  /* ── 4. Lightbox ────────────────────────────────────────── */
  var box      = document.getElementById('box');
  var boxImg   = document.getElementById('box-img');
  var boxCap   = document.getElementById('box-cap');
  var boxMode  = document.getElementById('box-mode');
  var current  = -1;
  var lastFocus = null;

  /* View mode: false = the photo, true = the phone-wallpaper
     screenshot. Deliberately preserved when stepping between
     photos, so you can browse wallpaper previews in a row. */
  var wallpaper = false;

  function openBox(i) {
    if (!box || i < 0 || i >= visible.length) return;
    lastFocus = document.activeElement;
    current = i;
    showCurrent();
    box.classList.add('open');
    box.setAttribute('aria-hidden', 'false');
    document.body.classList.add('locked');
    var closeBtn = box.querySelector('.box__close');
    if (closeBtn) closeBtn.focus();
  }

  function closeBox() {
    if (!box) return;
    box.classList.remove('open');
    box.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('locked');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function showCurrent() {
    var p = visible[current];
    if (!p) return;

    /* No wallpaper shot for this one: hide the toggle and fall back */
    var hasDemo = !!p.demo;
    if (boxMode) boxMode.hidden = !hasDemo;
    if (!hasDemo) wallpaper = false;

    var suffix = wallpaper ? '_demo' : '';
    var main = (p.t && p.t[LANG]) || '';
    var sub  = (p.t && p.t.en) || '';
    var dual = LANG !== 'en' && sub && sub !== main;

    boxImg.src = 'images/' + p.file + suffix + '.jpg';
    boxImg.alt = main + (dual ? ' ' + sub : '') +
                 (wallpaper ? t('js.wallpaperAlt') : '');

    boxCap.innerHTML = dual ? '<b></b> — <span></span>' : '<b></b>';
    boxCap.querySelector('b').textContent = main;
    if (dual) boxCap.querySelector('span').textContent = sub;

    if (boxMode && hasDemo) {
      boxMode.setAttribute('aria-pressed', String(wallpaper));
      boxMode.textContent = wallpaper ? t('js.wallpaperOff') : t('js.wallpaperOn');
    }
  }

  function toggleWallpaper() {
    var p = visible[current];
    if (!p || !p.demo) return;
    wallpaper = !wallpaper;
    showCurrent();
  }

  /* Add the length before the modulo so stepping back from index 0
     wraps to the end instead of returning -1 */
  function step(delta) {
    if (!visible.length) return;
    current = (current + delta + visible.length) % visible.length;
    showCurrent();
  }

  if (box) {
    box.querySelector('.box__close').addEventListener('click', closeBox);
    box.querySelector('.box__prev').addEventListener('click', function () { step(-1); });
    box.querySelector('.box__next').addEventListener('click', function () { step(1); });
    if (boxMode) boxMode.addEventListener('click', toggleWallpaper);

    /* If the wallpaper shot is missing, fall back to the photo
       rather than leaving a broken image on screen */
    boxImg.addEventListener('error', function () {
      if (wallpaper) { wallpaper = false; showCurrent(); }
    });

    /* clicking the backdrop (not the image or a button) closes */
    box.addEventListener('click', function (e) {
      if (e.target === box) closeBox();
    });

    document.addEventListener('keydown', function (e) {
      if (!box.classList.contains('open')) return;
      if (e.key === 'Escape')     closeBox();
      if (e.key === 'ArrowLeft')  step(-1);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'w' || e.key === 'W') toggleWallpaper();
    });
  }

  /* ── Active-section indicator in the nav ────────────────── */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav a'));
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  if (sections.length) {
    var navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle('active',
            a.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, {
      /* Judge against the middle of the viewport, so a section counts
       as current once its middle crosses the centre line */
      rootMargin: '-45% 0px -45% 0px'
    });
    sections.forEach(function (s) { navObserver.observe(s); });
  }

  /* ── Mobile nav toggle ──────────────────────────────────── */
  /* Below 780px the side rail is restyled as a panel behind a button
     in the top left corner (see the mobile query in style.css). It is
     the same <nav> element, so the indicator above still applies —
     nothing here knows about sections.

     State lives in one place: body.nav-open drives the CSS, and
     aria-expanded mirrors it for assistive tech. */
  var navBtn   = document.getElementById('navbtn');
  var navScrim = document.getElementById('nav-scrim');
  var navEl    = document.getElementById('nav');

  if (navBtn && navEl) {
    var navIsOpen = function () {
      return document.body.classList.contains('nav-open');
    };

    var setNav = function (open) {
      document.body.classList.toggle('nav-open', open);
      navBtn.setAttribute('aria-expanded', String(open));
      /* Removed from the tree while closed, so an invisible sheet is
         never left swallowing taps. The delay lets the fade finish. */
      if (!navScrim) return;
      if (open) {
        navScrim.hidden = false;
      } else {
        setTimeout(function () { if (!navIsOpen()) navScrim.hidden = true; }, 300);
      }
    };

    navBtn.addEventListener('click', function () { setNav(!navIsOpen()); });

    /* Every link jumps to a section, so the panel has done its job */
    navEl.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });

    if (navScrim) navScrim.addEventListener('click', function () { setNav(false); });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !navIsOpen()) return;
      setNav(false);
      navBtn.focus();
    });

    /* Crossing back over the breakpoint restores the desktop rail,
       which ignores nav-open — but aria-expanded would still read
       true, and the scrim would still be covering the page. */
    window.addEventListener('resize', function () {
      if (window.innerWidth > 780 && navIsOpen()) setNav(false);
    });
  }

  /* ── Theme ──────────────────────────────────────────────── */
  /* A palette is a set of custom properties selected by data-theme
     on <html>; see the top of css/style.css. The inline script in
     <head> has already applied the stored choice by the time this
     runs — doing it here would be too late, the page would have
     painted. What is left is switching, keeping both switchers in
     step, and remembering the choice.

     To add a palette: a :root[data-theme="name"] block and a
     .theme__dot rule in the stylesheet, a button in template.html,
     and the name in the list below. */
  var THEMES = ['gold', 'forest', 'nebula', 'ocean', 'sweet'];
  var themeBtns = Array.prototype.slice.call(
    document.querySelectorAll('[data-theme-set]'));

  if (themeBtns.length) {
    var applyTheme = function (name, remember) {
      /* A palette dropped from the stylesheet would otherwise leave
         the page with an attribute nothing styles */
      if (THEMES.indexOf(name) === -1) name = THEMES[0];

      /* Gold is the default and lives on :root itself, so it is the
         absence of the attribute rather than a value of it. */
      if (name === THEMES[0]) {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', name);
      }

      themeBtns.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.themeSet === name));
      });

      if (!remember) return;
      /* Safari in private mode throws on write, and the theme still
         applies for this visit, so a failure here is not worth
         interrupting anything for. */
      try { localStorage.setItem('theme', name); } catch (e) {}
    };

    themeBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        applyTheme(b.dataset.themeSet, true);
      });
    });

    /* The markup ships with gold pressed. Read the stored value back
       and re-run, so the dots agree with what <head> already did. */
    var savedTheme = null;
    try { savedTheme = localStorage.getItem('theme'); } catch (e) {}
    applyTheme(savedTheme || THEMES[0], false);
  }

  /* Hero portrait: show the placeholder if the file is missing */
  var me = document.getElementById('me');
  if (me) {
    me.addEventListener('error', function () {
      me.closest('.hero__portrait').classList.add('is-empty');
    });
    /* Some browsers decide it failed before this listener is bound,
       so check the already-settled case too */
    if (me.complete && me.naturalWidth === 0) {
      me.closest('.hero__portrait').classList.add('is-empty');
    }
  }

  /* fill the current year into the footer */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
