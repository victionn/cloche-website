/* Cloche — site behaviour. No dependencies.
   Every effect checks prefers-reduced-motion and degrades to static. */

(function () {
  'use strict';

  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = matchMedia('(pointer: fine)').matches;

  /* ---------- Preloader belt-and-braces ----------
     The loader runs from its own inline script (index.html) so it can start
     before this file lands. If that script ever wedges — an error mid-
     choreography, a missed cap — this independent sweeper unsticks the page.
     Normal runs finish well inside the window and this is a no-op. */

  setTimeout(function () {
    var loader = document.getElementById('loader');
    if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
    document.documentElement.classList.remove('is-loading', 'is-arriving');
  }, 6500);

  /* ---------- Theme toggle + themed screenshots ----------
     App screenshots have pre-generated dark variants (assets/*-dark.png,
     recoloured with the app's own dark tokens); swap sources with the theme. */

  function syncMedia(theme) {
    /* Eager images use <picture> instead of a src swap, so the preload scanner
       resolves the theme itself and fetches one file rather than two. That
       leaves the explicit toggle to override the media query by hand: forcing
       the source on or off makes the browser re-run its selection. Do this
       before the src swaps below — these elements have no [data-dark-src]. */
    document.querySelectorAll('source[data-dark-source]').forEach(function (src) {
      var want = theme === 'dark' ? 'all' : 'not all';
      if (src.media !== want) src.media = want;
    });
    document.querySelectorAll('img[data-dark-src]').forEach(function (img) {
      if (!img.dataset.lightSrc) img.dataset.lightSrc = img.getAttribute('src');
      var want = theme === 'dark' ? img.dataset.darkSrc : img.dataset.lightSrc;
      if (img.getAttribute('src') !== want) img.setAttribute('src', want);
    });
    /* Video posters get the same treatment. The clip itself has no dark
       recording and is recoloured in CSS instead.
       The light poster is authored as data-light-poster rather than a real
       poster attribute — the attribute is fetched on layout, well before this
       runs, so leaving it in the markup made every dark visitor pull the light
       still too. The fallback below still captures an inline one if any video
       ever keeps its attribute. */
    document.querySelectorAll('video[data-dark-poster]').forEach(function (vid) {
      if (!vid.dataset.lightPoster) vid.dataset.lightPoster = vid.getAttribute('poster');
      var want = theme === 'dark' ? vid.dataset.darkPoster : vid.dataset.lightPoster;
      if (vid.getAttribute('poster') !== want) vid.setAttribute('poster', want);
    });
  }
  syncMedia(document.documentElement.dataset.theme);

  var toggle = document.getElementById('theme-toggle');
  toggle.addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('cloche-theme', next);
    syncMedia(next);
  });

  /* ---------- Nav background on scroll ---------- */

  var nav = document.getElementById('nav');
  function onScrollNav() {
    nav.classList.toggle('scrolled', scrollY > 10);
  }
  addEventListener('scroll', onScrollNav, { passive: true });
  onScrollNav();

  /* ---------- Hero split-word rise ----------
     Wrap each word in an overflow mask (.w) around an inner span (.wi)
     that starts at translateY(110%) and rises with a 70ms stagger.
     Skipped entirely under reduced motion — the text just renders. */

  /* Where [data-hl]'s phrase sits in the split copy, as a start index into
     words, or -1. Compared lowercased and stripped of punctuation so the
     attribute can name the words plainly however the copy punctuates them. */
  function accentStart(words, phrase) {
    if (!phrase) return -1;
    var bare = function (w) { return w.toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var want = phrase.trim().split(/\s+/).map(bare);
    var have = words.map(bare);
    for (var i = 0; i + want.length <= have.length; i++) {
      var hit = true;
      for (var j = 0; j < want.length; j++) if (have[i + j] !== want[j]) { hit = false; break; }
      if (hit) return i;
    }
    return -1;
  }

  function splitWords(el, text, baseDelay) {
    var words = String(text).trim().split(/\s+/);
    var phrase = el.dataset.hl || '';
    var hlLen = phrase ? phrase.trim().split(/\s+/).length : 0;
    var hlAt = accentStart(words, phrase);

    /* One mask per word, except the accent run, which takes a single mask for
       the whole phrase. Split across masks each word is its own inline-block,
       so the accent rule is painted per box and the boxes' edges don't line up
       once they round to device pixels — a hairline seam shows in the rule at
       the space. One box, one unbroken rule. It also holds the phrase together
       across a line break, which is what you want of the words being pointed
       at anyway. */
    var units = [];
    for (var u = 0; u < words.length; u++) {
      if (u === hlAt) {
        units.push({ text: words.slice(hlAt, hlAt + hlLen).join(' '), hl: true });
        u += hlLen - 1;
      } else {
        units.push({ text: words[u], hl: false });
      }
    }

    el.textContent = '';
    units.forEach(function (unit, i) {
      var mask = document.createElement('span');
      mask.className = 'w';
      var inner = document.createElement('span');
      inner.className = 'wi';
      if (unit.hl) inner.classList.add('hl');
      inner.textContent = unit.text;
      inner.style.setProperty('--d', (baseDelay + i * 0.07) + 's');
      mask.appendChild(inner);
      el.appendChild(mask);
      el.appendChild(document.createTextNode(' '));
    });
  }

  if (!reduceMotion) {
    document.querySelectorAll('.split-words').forEach(function (el, blockIndex) {
      // The subhead block starts after the headline finishes its run
      splitWords(el, el.textContent, blockIndex * 0.3);
    });
  }

  /* ---------- Scroll reveals ----------
     IntersectionObserver adds .in once; CSS does the blur-up.
     Children of [data-reveal-children] get a 70ms stagger via --d. */

  document.querySelectorAll('[data-reveal-children]').forEach(function (parent) {
    Array.prototype.forEach.call(parent.children, function (child, i) {
      child.style.setProperty('--d', (i * 0.07) + 's');
    });
  });

  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        revealIO.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('[data-reveal], [data-reveal-children]').forEach(function (el) {
    revealIO.observe(el);
  });

  /* ---------- Marquee ----------
     The loop is one group wide: the track slides left by exactly the width of
     the first group and starts over, so the copy that arrives is the copy that
     just left. Two things it has to get right, both of which showed as a jump
     on a real phone rather than in any desktop browser:

     - The distance is measured in whole pixels, not -50%. A percentage of a
       max-content flex row lands on a fraction, iOS rounds the start and the
       end of the loop differently, and the seam shows up as a jerk once a
       cycle.
     - There have to be enough copies to cover the screen AND the group that
       is sliding off it — n * W >= viewport + W. Six roles is a narrower
       group than the nine it replaced, so on a wide screen two copies left a
       hole; the clone count is now whatever it takes, not a fixed one.

     Speed is fixed in px/s and the duration derived from the width, so the
     roles travel at the same pace whatever the type size or the copy count. */

  var track = document.getElementById('marquee-track');
  if (track) (function () {
    var group = track.querySelector('.marquee-group');
    var SPEED = 46; // px per second

    function build() {
      // Back to one group before measuring: the clones are what we are sizing
      while (track.children.length > 1) track.removeChild(track.lastChild);

      var width = group.getBoundingClientRect().width;
      if (!width) return;

      // Whole pixels: the seam is invisible only if the shift is exactly the
      // width the next copy starts at, and layout rounds that to an integer.
      var shift = Math.round(width);
      var copies = Math.max(2, Math.ceil((innerWidth + shift) / shift));
      for (var i = 1; i < copies; i++) {
        var clone = group.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
      }

      track.style.setProperty('--marquee-shift', -shift + 'px');
      track.style.setProperty('--marquee-duration', (shift / SPEED).toFixed(2) + 's');
    }

    build();

    /* Fonts land after first paint and change the group's width under the
       loop, which is the other way the seam opens up. Rebuild once they are
       in, and on a resize that actually changes the width (iOS fires resize
       for the address bar collapsing, which must not restart the animation). */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);

    var lastWidth = innerWidth;
    var resizeSettle = 0;
    addEventListener('resize', function () {
      if (innerWidth === lastWidth) return;
      lastWidth = innerWidth;
      clearTimeout(resizeSettle);
      resizeSettle = setTimeout(build, 200);
    });
  })();

  /* ---------- Scroll gallery ----------
     The rail scrolls natively; this only adds the two arrows, drag-with-a-
     mouse, and the disabled states at either end. Nothing here is required
     for the rail to work — with JS off the arrows are hidden (see styles.css)
     and it stays a plain scroller. */

  var rail = document.getElementById('gallery-viewport');
  if (rail) {
    var railPrev = document.getElementById('gallery-prev');
    var railNext = document.getElementById('gallery-next');
    var railCards = rail.querySelectorAll('.gallery-card');

    // Card pitch measured off the DOM rather than hard-coded, so the clamped
    // card width and the gap can change in CSS without touching this.
    function railStep() {
      if (railCards.length < 2) return rail.clientWidth;
      return railCards[1].offsetLeft - railCards[0].offsetLeft;
    }

    function railSync() {
      var max = rail.scrollWidth - rail.clientWidth;
      railPrev.disabled = rail.scrollLeft <= 1;
      railNext.disabled = rail.scrollLeft >= max - 1;
    }

    /* Scroll to an absolute card position rather than by a delta. Deltas drift:
       a half-finished smooth scroll or a drag that stopped between two cards
       compounds into the next press, and the rail slowly loses its alignment
       with the gutter. Snapping to an index can't.

       The index is held here rather than derived from scrollLeft on each press.
       scrollLeft lags a smooth scroll by design, so reading it back meant a
       quick double-press resolved to the same card twice and only ever moved
       one along. A drag re-syncs it once the rail settles. */
    var railIndex = 0;
    var railSettle = 0;

    function railPage(dir) {
      var step = railStep();
      var max = rail.scrollWidth - rail.clientWidth;
      // Clamp in pixels as well as by card: the last card comes to rest short
      // of its own snap position, and an index that ran past it would need
      // several presses of the other arrow before anything visibly moved.
      var left = Math.min(max, Math.max(0, (railIndex + dir) * step));
      railIndex = Math.round(left / step);
      rail.scrollTo({ left: left, behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    railPrev.addEventListener('click', function () { railPage(-1); });
    railNext.addEventListener('click', function () { railPage(1); });

    rail.addEventListener('scroll', function () {
      railSync();
      // Once the rail is quiet — end of a drag, a swipe, a wheel — adopt
      // wherever it actually came to rest as the new starting point.
      clearTimeout(railSettle);
      railSettle = setTimeout(function () {
        railIndex = Math.round(rail.scrollLeft / railStep());
      }, 120);
    }, { passive: true });

    /* styles.css loads async (see the media="print" swap in index.html), so
       this file can run while the rail is still an unstyled, unscrollable
       block — measure then and both arrows come up dead. A ResizeObserver
       catches that hand-over along with font swaps, image layout and window
       resizes; the load listener is the fallback where it is missing. */
    if (window.ResizeObserver) {
      var railRO = new ResizeObserver(railSync);
      railRO.observe(rail);
      railRO.observe(rail.querySelector('.gallery-track'));
    } else {
      addEventListener('resize', railSync);
      addEventListener('load', railSync);
    }
    railSync();

    /* Click-and-drag, mouse only — touch already has momentum scrolling and
       pens shouldn't hijack the page. */
    if (finePointer) {
      var dragging = false, dragStartX = 0, dragStartLeft = 0, dragMoved = 0;
      var swallowClick = false;

      /* A drag that ends on a card link would otherwise fire a click and
         navigate. This eats exactly one click, and only when the pointer
         actually travelled — a plain click must still follow its link. The
         flag is cleared on the next press, so a drag that ends over nothing
         (no click to eat) can't leave a trap armed for later. */
      rail.addEventListener('click', function (e) {
        if (!swallowClick) return;
        swallowClick = false;
        e.preventDefault();
        e.stopPropagation();
      }, true);

      rail.addEventListener('pointerdown', function (e) {
        swallowClick = false;
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        dragging = true;
        dragMoved = 0;
        dragStartX = e.clientX;
        dragStartLeft = rail.scrollLeft;
        rail.setPointerCapture(e.pointerId);
        rail.classList.add('is-dragging');
      });

      rail.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - dragStartX;
        dragMoved = Math.max(dragMoved, Math.abs(dx));
        rail.scrollLeft = dragStartLeft - dx;
      });

      function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        rail.classList.remove('is-dragging'); // snapping re-engages here
        if (rail.hasPointerCapture(e.pointerId)) rail.releasePointerCapture(e.pointerId);
        swallowClick = dragMoved > 5;
      }
      rail.addEventListener('pointerup', endDrag);
      rail.addEventListener('pointercancel', endDrag);
    }
  }

  /* ---------- Hero copy budget ----------
     On phones the hero stacks and the device is sized off what the copy above
     it does NOT take (see --copy-block in styles.css). The CSS value is an
     estimate off the viewport width, and it has to be pessimistic enough to
     cover the widest wrap — which left 60-80px of unused height on most
     widths, and the phone paid for all of it. Measure the block instead and
     hand the real number back, so every point the copy doesn't use goes to
     the screenshot. The CSS estimate stays as the no-JS fallback.

     Safe against a loop: --copy-block only feeds the device's width, and the
     copy is a full-width row above it, so its own height can't be moved by
     what this sets.

     The budget is the taller of the two sides, not whatever is on screen. The
     Work/Hire toggle rewrites the headline and the sub, and at some widths one
     side wraps a line further than the other — budget only for the side in
     view and the phone visibly jumps size mid-swap. So the other side's copy
     is dropped into the real elements, measured, and put straight back — all
     inside one task, so nothing is ever painted in the swapped state. */
  var heroSection = document.querySelector('.hero');
  var heroCopy = document.querySelector('.hero-copy');
  if (heroSection && heroCopy) {
    var copyBlockLast = -1;

    /* Built through splitWords, not as plain text: each word is its own
       inline-block mask, which wraps differently from a plain string — measure
       the plain version and a side that actually takes an extra line looks
       like it doesn't. */
    function heroCopyAlt() {
      var swapped = [];
      heroCopy.querySelectorAll('[data-side-copy]').forEach(function (el) {
        var isWork = el.textContent.trim() === (el.dataset.work || '').trim();
        var alt = isWork ? el.dataset.hire : el.dataset.work;
        if (!alt) return;
        swapped.push([el, el.innerHTML, el.dataset.hl || '']);
        el.dataset.hl = (isWork ? el.dataset.hireHl : el.dataset.workHl) || '';
        splitWords(el, alt, 0);
      });
      var h = heroCopy.getBoundingClientRect().height;
      swapped.forEach(function (s) { s[0].innerHTML = s[1]; s[0].dataset.hl = s[2]; });
      return h;
    }

    /* Always the current layout, never a running maximum: styles.css loads
       async, so the first reading here can be of an unstyled block several
       times too tall, and a high-water mark would keep that forever. */
    function heroCopyBlock() {
      var h = Math.ceil(Math.max(heroCopy.getBoundingClientRect().height, heroCopyAlt()));
      if (!h || h === copyBlockLast) return;
      copyBlockLast = h;
      heroSection.style.setProperty('--copy-block', h + 'px');
    }

    if (window.ResizeObserver) new ResizeObserver(heroCopyBlock).observe(heroCopy);
    else addEventListener('resize', heroCopyBlock);
    addEventListener('load', heroCopyBlock);
    /* The font swap is the one change the observer can miss: it can move the
       side that ISN'T on screen across a wrap without touching the height of
       the side that is, so nothing resizes and no notification arrives. */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(heroCopyBlock);
    heroCopyBlock();
  }

  /* ---------- Hero side toggle ----------
     The one interactive work/hire switch on the page (#sides is static copy).
     The tabpanels are the screenshots themselves; the crossfade plus a quick
     cloche beat make the flip read as the feed re-refreshing. */

  var tabs = [document.getElementById('tab-work'), document.getElementById('tab-hire')];
  var swapImgs = document.querySelectorAll('.swap-img');
  var screenCloche = document.getElementById('screen-cloche');
  var beatRaf = 0;

  function refreshBeat() {
    // Short and purely decorative — it never blocks the crossfade or input
    if (reduceMotion || !screenCloche) return;
    cancelAnimationFrame(beatRaf);
    var FRAMES = 36, COLS = 6, DURATION = 520;
    var start = performance.now();
    screenCloche.classList.add('is-on');
    (function step(now) {
      var t = Math.min(1, (now - start) / DURATION);
      // Closed to open — the arc a real refresh takes: the mark arms on the
      // plain dome and resolves into the hand, then clears (pull-indicator.tsx).
      var p = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // in-out quad
      var i = Math.round(p * (FRAMES - 1));
      screenCloche.style.backgroundPosition = ((i % COLS) * 20) + '% ' + (((i / COLS) | 0) * 20) + '%';
      if (t < 1) beatRaf = requestAnimationFrame(step);
      else screenCloche.classList.remove('is-on');
    })(start);
  }

  /* The headline flips with the side. The words on screen retire up out of
     their masks, then the new ones rise in from below on the same stagger as
     first paint — so the swap reads as one travel rather than a cut. */
  var headingEls = document.querySelectorAll('[data-side-copy]');
  var headingTimers = [];
  var HEADING_OUT = 300; // matches the .is-out fall in styles.css

  function swapHeadline(index) {
    headingTimers.forEach(clearTimeout);
    headingTimers = [];
    headingEls.forEach(function (heading) {
      var next = index === 1 ? heading.dataset.hire : heading.dataset.work;
      if (!next) return;
      // The accent belongs to the copy, so it changes with it — splitWords
      // reads data-hl, so set the incoming side's phrase before rebuilding.
      heading.dataset.hl = (index === 1 ? heading.dataset.hireHl : heading.dataset.workHl) || '';
      // Under reduced motion splitWords still runs: CSS pins .wi at rest, so
      // this is a plain re-render that keeps the accent spans.
      if (reduceMotion) { splitWords(heading, next, 0); return; }
      var out = heading.querySelectorAll('.wi');
      out.forEach(function (inner, i) {
        inner.style.setProperty('--d', (i * 0.05) + 's');
        inner.classList.add('is-out');
      });
      headingTimers.push(setTimeout(function () {
        splitWords(heading, next, 0);
      }, HEADING_OUT + (out.length - 1) * 50));
    });
  }

  function selectTab(index) {
    tabs.forEach(function (tab, i) {
      tab.classList.toggle('is-active', i === index);
      tab.setAttribute('aria-selected', i === index ? 'true' : 'false');
      swapImgs[i].classList.toggle('is-active', i === index);
    });
    swapHeadline(index);
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () {
      if (tab.classList.contains('is-active')) return;
      selectTab(i);
      refreshBeat();
    });
    // Left/right arrows move between the two tabs, per the tabs pattern
    tab.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        var next = 1 - i;
        selectTab(next);
        refreshBeat();
        tabs[next].focus();
      }
    });
  });

  /* ---------- Side toggle: hero → nav ----------
     The toggle starts under the hero phone and sticks to the bar when the
     page scrolls up to it — CSS position:sticky does the travel, so it is the
     browser's own scrolling, not a scroll handler chasing it a frame late.

     JS only measures: where the rail starts (the toggle's place in the hero),
     how far below the top of the viewport the bar's centre line is, and the
     one horizontal offset it keeps the whole way — the toggle never moves
     sideways, in the hero or in the bar. An observer flips .is-docked at the
     moment it lands. */

  var tabsSlot = document.getElementById('hero-tabs-slot');
  var tabsRail = document.getElementById('tabs-rail');
  var tabsPill = document.getElementById('hero-tabs');
  var railSentinel = document.getElementById('rail-sentinel');

  if (tabsSlot && tabsRail && tabsPill) (function () {
    var wordmark = nav.querySelector('.wordmark');
    var navActions = nav.querySelector('.nav-actions');
    var dockTop = 10, dockIO = null;

    function measure() {
      var pill = tabsPill.getBoundingClientRect();
      var slot = tabsSlot.getBoundingClientRect();

      // The slot holds the toggle's place in the hero — the rail starts there
      tabsSlot.style.height = pill.height + 'px';
      tabsRail.style.setProperty('--rail-top', Math.round(slot.top + pageYOffset) + 'px');

      // Sat on the bar's own centre line — the one the wordmark, the theme
      // toggle and the CTA all sit on — rather than centred in the bar's box,
      // which the toggle's taller pill would read low against.
      var inner = nav.querySelector('.nav-inner').getBoundingClientRect();
      dockTop = Math.max(0, +(inner.top + inner.height / 2 - pill.height / 2).toFixed(2));
      tabsRail.style.setProperty('--dock-top', dockTop + 'px');

      // One horizontal place, held from the hero into the bar: the middle,
      // pulled aside only as far as it takes to clear the wordmark and the
      // actions on a bar too narrow to hold all three side by side.
      var rail = tabsRail.getBoundingClientRect();
      var mid = rail.left + rail.width / 2;
      var GAP = 10, x = 0;
      var left = wordmark && wordmark.getBoundingClientRect();
      var right = navActions && navActions.getBoundingClientRect();
      if (left && right) {
        var lo = left.right + GAP + pill.width / 2;   // leftmost centre that clears the wordmark
        var hi = right.left - GAP - pill.width / 2;   // rightmost that clears the actions
        if (hi > lo) x = Math.round(Math.min(hi, Math.max(lo, mid)) - mid);
      }
      tabsRail.style.setProperty('--x', x + 'px');

      if (dockIO) dockIO.disconnect();
      // The sentinel sits at the top of the rail — the toggle's own top edge —
      // so it leaves this inset root the moment the toggle touches the bottom
      // of the bar, which is when the toggle sheds its fill and the section
      // links step aside. It is still sliding the last few pixels up into
      // place by then, and arrives with the bar already made room.
      dockIO = new IntersectionObserver(function (entries) {
        var docked = !entries[entries.length - 1].isIntersecting;
        tabsRail.classList.toggle('is-docked', docked);
        nav.classList.toggle('tabs-docked', docked);
      }, { rootMargin: -nav.offsetHeight + 'px 0px 0px 0px', threshold: 0 });
      dockIO.observe(railSentinel);
    }

    measure();

    // Fonts and the loader both settle the hero's height; re-measure after
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    addEventListener('load', measure);

    /* --rail-top is an absolute page coordinate, so anything that moves the
       slot after the reads above leaves the toggle parked at a stale spot —
       and on a phone that spot is off the bottom of the hero. The copy above
       it is what moves: it reflows as the hero type settles, and again on
       every side flip, where the headline can change line count. Watch the
       triggers.

       Deliberately not the slot itself: measure() sets its height, which would
       feed straight back in. */
    if (window.ResizeObserver) {
      var slotRO = new ResizeObserver(function () { measure(); });
      slotRO.observe(document.querySelector('.hero-copy'));
      slotRO.observe(document.querySelector('.hero-device'));
    }

    var reMeasure;
    addEventListener('resize', function () {
      clearTimeout(reMeasure);
      reMeasure = setTimeout(measure, 150);
    }, { passive: true });
  })();

  /* ---------- Pinned phone: crossfade per copy beat ----------
     Each copy block reports when it crosses the middle band of the
     viewport; the matching screenshot fades in. No scroll math. */

  var beatImgs = document.querySelectorAll('.beat-img');
  var beatIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var index = entry.target.dataset.beat;
      beatImgs.forEach(function (img) {
        img.classList.toggle('is-active', img.dataset.beat === index);
      });
    });
  }, { rootMargin: '-45% 0px -45% 0px' }); // only the middle 10% of the viewport counts

  document.querySelectorAll('.beat').forEach(function (beat) {
    beatIO.observe(beat);
  });

  /* ---------- Full-screen map: pins land on scroll ----------
     The bare map covers the viewport; scroll progress through the tall
     .mapscroll section rains the pins onto it, smallest counts first, the
     CBD's 37 last. Every pin is a pure function of scroll position — scrub
     back up and they lift off in reverse order. The summary chip counts
     along with them. */

  var mapSection = document.getElementById('map');
  if (mapSection) {
    var mapStage = document.getElementById('map-stage');
    var mapTitles = document.getElementById('map-titles');
    var chipJobs = document.getElementById('map-chip-jobs');
    var chipSuburbs = document.getElementById('map-chip-suburbs');

    /* [x%, y%, jobs] — the tip of each teardrop on the base image. Positions
       were measured off the app's own map screenshot (assets/02-map.png) and
       registered onto the clean simulator capture the base is cut from
       (SIFT + RANSAC similarity fit, 942 inliers), so every pin sits on its
       real suburb. The visible pins sum to 222; the app's headline numbers
       are 314 jobs / 48 suburbs (some pins sit behind others), so the chip
       scales up to land on those. */
    var PIN_DATA = [
      [44.52, 25.84, 3], [56.49, 25.84, 6], [78.22, 25.84, 9],
      [45.61, 32.28, 3], [49.91, 32.28, 3], [60.27, 31.57, 6],
      [64.74, 32.28, 5], [69.80, 31.34, 3], [36.51, 34.77, 8],
      [35.75, 37.95, 4], [56.32, 36.54, 5], [45.28, 38.19, 6],
      [62.47, 38.49, 37], [66.51, 38.61, 8], [64.83, 40.50, 14],
      [74.69, 38.84, 4], [69.63, 39.91, 5], [51.09, 41.32, 6],
      [44.69, 42.21, 5], [75.86, 42.57, 5], [56.06, 43.86, 13],
      [59.52, 45.40, 8], [73.84, 44.69, 4], [51.00, 46.05, 11],
      [69.54, 46.58, 10], [25.81, 47.41, 2], [58.00, 49.42, 9],
      [44.77, 52.96, 6], [50.25, 54.67, 6], [39.88, 56.03, 7],
      [70.30, 58.40, 1]
    ];
    var JOBS_TOTAL = 314, SUBURBS_TOTAL = 48;

    // The app's pin ramp, green through to deep red, sampled off its markers
    var RAMP = [
      [1, [119, 206, 125]], [3, [143, 193, 85]], [5, [179, 188, 78]],
      [6, [207, 180, 74]], [8, [221, 144, 54]], [10, [219, 119, 46]],
      [13, [201, 78, 40]], [16, [185, 49, 34]], [37, [158, 27, 27]]
    ];
    function pinColour(n) {
      var i = 1;
      while (i < RAMP.length - 1 && RAMP[i][0] < n) i++;
      var a = RAMP[i - 1], b = RAMP[i];
      var t = Math.min(1, Math.max(0, (n - a[0]) / (b[0] - a[0])));
      function ch(k) { return Math.round(a[1][k] + (b[1][k] - a[1][k]) * t); }
      return 'rgb(' + ch(0) + ',' + ch(1) + ',' + ch(2) + ')';
    }

    // Land order: small counts first, the 37 as the closing beat.
    // North-to-south inside a tie so equal pins sweep down the map.
    var pinOrder = PIN_DATA.slice().sort(function (a, b) {
      return (a[2] - b[2]) || (a[1] - b[1]);
    });

    var visibleSum = 0;
    pinOrder.forEach(function (p) { visibleSum += p[2]; });

    var mapPins = pinOrder.map(function (p) {
      var el = document.createElement('div');
      el.className = 'map-pin';
      // Sized by count like the app. Scaled to the clean capture's camera,
      // which sits ~0.78x the old screenshot's zoom: ~5.3% for a 1 up to ~8%.
      var w = 5.3 + Math.min(p[2], 20) / 20 * 2.7;
      el.style.left = p[0] + '%';
      el.style.top = p[1] + '%';
      el.style.width = w + '%';
      el.style.zIndex = 10 + p[2]; // busier pins sit on top, as in the app
      var fs = p[2] > 9 ? 22 : 25;
      el.innerHTML =
        '<div class="pin-fall">' +
          '<svg viewBox="0 0 64 84" aria-hidden="true">' +
            '<path d="M32 80C27 63 8 52 8 32a24 24 0 1 1 48 0c0 20-19 31-24 48Z" fill="' + pinColour(p[2]) + '" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/>' +
            '<text x="32" y="' + (32 + fs * 0.36) + '" text-anchor="middle" font-family="Inter Tight, Inter, system-ui, sans-serif" font-weight="700" font-size="' + fs + '" fill="#141414">' + p[2] + '</text>' +
          '</svg>' +
        '</div>';
      mapStage.appendChild(el);
      return { jobs: p[2], fall: el.firstChild, lastT: -1 };
    });

    /* ---- Framing ----
       The base image is the whole Sydney basin, but the pins only occupy a
       band through its middle; shown whole it reads as a lot of empty
       outskirts. So the frame is derived from the pins rather than the image:
       zoom until the pin band covers the viewport on both axes, and pan so the
       busiest pin (the CBD's 37) sits dead centre.

       All of it is in px against the stage's own untransformed box, which
       CSS puts at x ∈ [vw/2, vw/2 + W], y ∈ [0, H] — hence the transform-origin
       of 0 0 and the -vw/2 that used to be `translateX(-50%)`. */

    // The busiest pin's tip, and how far its body rises above that tip.
    var ANCHOR = PIN_DATA.reduce(function (a, b) { return b[2] > a[2] ? b : a; });
    var PIN_W_MAX = 0.08;              // widest pin, as a fraction of stage width
    var PIN_H_MAX = PIN_W_MAX * 84 / 64; // its svg is 64 x 84

    /* The pins' bounding box, padded by the pin artwork itself: a pin is drawn
       centred on its tip horizontally and entirely above it vertically. */
    var pinMinX = Infinity, pinMaxX = -Infinity, pinMinY = Infinity, pinMaxY = -Infinity;
    PIN_DATA.forEach(function (p) {
      pinMinX = Math.min(pinMinX, p[0] / 100);
      pinMaxX = Math.max(pinMaxX, p[0] / 100);
      pinMinY = Math.min(pinMinY, p[1] / 100);
      pinMaxY = Math.max(pinMaxY, p[1] / 100);
    });

    /* The stage's layout size ignores its own transform, so it only changes on
       resize — measured there rather than inside the per-frame scrub, which
       would otherwise force a reflow every animation frame. Height comes from
       the base image's ratio rather than offsetHeight: before the image has
       loaded the element's aspect-ratio hasn't settled and offsetHeight reads
       far too tall, which would poison the cache for the rest of the page. */
    var stageW = 0, stageH = 0;
    function mapMeasure() {
      stageW = mapStage.offsetWidth;
      stageH = stageW * 1720 / 1206;
    }
    mapMeasure();
    addEventListener('load', function () { mapMeasure(); });

    function mapFrame(zoom) {
      var W = stageW, H = stageH;
      var vw = innerWidth, vh = innerHeight;

      var bandW = (pinMaxX - pinMinX) * W + PIN_W_MAX * W;
      var bandH = (pinMaxY - pinMinY) * H + PIN_H_MAX * W;

      /* Cover the viewport with the band. Capped so that on a narrow phone —
         where the band is only ~40% of a tall stage — the zoom stops before a
         single pin eats a third of the screen; a sliver of pin-free map at the
         very top and bottom sits under the title and chip scrims anyway. */
      var s = Math.max(vw / bandW, vh / bandH, 1);
      s = Math.min(s, 0.26 * vw / (PIN_W_MAX * W));

      /* Then back off half of it. Filling the frame edge to edge with the band
         crops too much of the map away and reads as a wall of pins, so only
         half the zoom-in is taken. 1 is the floor either way — below it the
         image no longer covers the viewport and the page shows past its edge. */
      s = (1 + (s - 1) * 0.5) * zoom;

      // Centre on the anchor pin's body, not its tip, so the pin looks centred
      var ax = ANCHOR[0] / 100 * W;
      var ay = ANCHOR[1] / 100 * H - 0.45 * PIN_H_MAX * W;

      // Then clamp so an edge of the image never pulls in off the viewport
      var tx = Math.max(vw / 2 - s * W, Math.min(-vw / 2, -s * ax));
      var ty = Math.max(vh - s * H, Math.min(0, vh / 2 - s * ay));

      mapStage.style.transform =
        'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
    }

    if (reduceMotion) {
      // Static finished state: pins land by default, the chip just shows.
      mapFrame(1);
      addEventListener('load', function () { mapFrame(1); });
      addEventListener('resize', function () { mapMeasure(); mapFrame(1); });
    } else {
      /* Each pin owns a slice of the scrub: [start, start + LAND] of section
         progress, staggered across the landing window. DROP is the fall
         height in pin-heights — far enough to clearly come "from above",
         near enough that the tip reads as aimed at its suburb throughout. */
      var LAND = 0.16, FIRST = 0.06, LAST = 0.82;
      var DROP = 320;
      var pitch = (LAST - LAND - FIRST) / Math.max(1, mapPins.length - 1);
      mapPins.forEach(function (pin, i) {
        pin.start = FIRST + pitch * i;
        pin.fall.style.opacity = '0';
        pin.fall.style.transform = 'translateY(-' + DROP + '%)';
      });
      /* The titles are never scrubbed: they stay pinned visible for the whole
         section (as does the chip, in CSS) so the map reads as labelled
         however the reader arrives at it or scrubs through it. */
      mapTitles.style.opacity = '1';
      mapTitles.style.transform = 'none';

      var easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };

      var mapLastP = -1;
      function mapApply(p) {
        // Slight settle-out of an opening zoom gives the map itself a drift
        mapFrame(1.05 - 0.05 * easeOutCubic(p));

        var landedJobs = 0, landedPins = 0;
        mapPins.forEach(function (pin) {
          var t = Math.min(1, Math.max(0, (p - pin.start) / LAND));
          if (t >= 1) { landedJobs += pin.jobs; landedPins++; }
          if (t === pin.lastT) return; // parked pins cost nothing
          pin.lastT = t;
          var e = easeOutCubic(t);
          // Decelerating fall — the pin sets down on its suburb, no bounce
          pin.fall.style.transform = 'translateY(-' + ((1 - e) * DROP) + '%)';
          pin.fall.style.opacity = Math.min(1, t / 0.22).toFixed(3);
        });

        chipJobs.textContent = Math.round(JOBS_TOTAL * landedJobs / visibleSum);
        chipSuburbs.textContent = Math.round(SUBURBS_TOTAL * landedPins / mapPins.length);
      }

      var mapActive = false;
      function mapScrub() {
        if (!mapActive) return;
        var rect = mapSection.getBoundingClientRect();
        var p = -rect.top / (rect.height - innerHeight);
        p = Math.min(1, Math.max(0, p));
        if (p !== mapLastP) { mapLastP = p; mapApply(p); }
        requestAnimationFrame(mapScrub);
      }
      var mapIO = new IntersectionObserver(function (entries) {
        mapActive = entries[0].isIntersecting;
        // Re-measure on the way in: a scrollbar appearing, or the loading
        // overlay releasing, changes the stage's width after the first read
        if (mapActive) { mapMeasure(); mapLastP = -1; requestAnimationFrame(mapScrub); }
      });
      mapIO.observe(mapSection);
      // A resize moves the framing even at the same scroll position
      addEventListener('resize', function () { mapMeasure(); mapLastP = -1; });
    }
  }

  /* ---------- Cloche video scrub ----------
     The section is 260svh tall; a sticky inner block holds the video.
     Scroll progress through the section maps to video time via rAF.
     Under reduced motion the section is static and the poster shows. */

  var video = document.getElementById('cloche-video');
  var clocheSection = document.getElementById('delight');

  if (!reduceMotion) {
    var scrubActive = false;
    var targetTime = 0;

    // Hand over from the dark poster to the recoloured video only once a frame
    // is actually decodable, so a failed or slow load never shows an inverted
    // poster (see .has-video in styles.css).
    video.addEventListener('loadeddata', function () {
      video.classList.add('has-video');
    });

    // Start fetching the video only when the section is approaching
    var loadIO = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        video.preload = 'auto';
        video.load();
        loadIO.disconnect();
      }
    }, { rootMargin: '150% 0px' });
    loadIO.observe(clocheSection);

    var activeIO = new IntersectionObserver(function (entries) {
      scrubActive = entries[0].isIntersecting;
      if (scrubActive) requestAnimationFrame(scrub);
    });
    activeIO.observe(clocheSection);

    function scrub() {
      if (!scrubActive) return;
      if (video.duration) {
        var rect = clocheSection.getBoundingClientRect();
        // 0 when the section top hits the viewport top, 1 when its bottom leaves
        var progress = -rect.top / (rect.height - innerHeight);
        progress = Math.min(1, Math.max(0, progress));
        targetTime = progress * (video.duration - 0.05);
        // Ease towards the target so seeks stay smooth between keyframes
        video.currentTime += (targetTime - video.currentTime) * 0.25;
      }
      requestAnimationFrame(scrub);
    }
  }

  /* ---------- Count-up stats ---------- */

  var counters = document.querySelectorAll('.count');
  var countIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      countIO.unobserve(entry.target);
      var el = entry.target;
      var end = parseInt(el.dataset.count, 10);
      if (reduceMotion) { el.textContent = end; return; }
      var start = null;
      var duration = 1400;
      function step(ts) {
        if (!start) start = ts;
        var t = Math.min(1, (ts - start) / duration);
        t = 1 - Math.pow(1 - t, 3); // ease-out cubic
        el.textContent = Math.round(end * t);
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }, { threshold: 0.6 });
  counters.forEach(function (el) { countIO.observe(el); });

  /* ---------- Magnetic buttons ----------
     Primary CTAs drift a few pixels towards the cursor. Mouse only. */

  if (!reduceMotion && finePointer) {
    document.querySelectorAll('.magnetic').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width / 2) / r.width;
        var dy = (e.clientY - r.top - r.height / 2) / r.height;
        btn.style.transform = 'translate(' + (dx * 6) + 'px,' + (dy * 5) + 'px)';
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.transform = '';
      });
    });
  }

  /* ---------- Card cursor glow ---------- */

  if (finePointer) {
    document.querySelectorAll('.card').forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }
})();

/* ---------- Hero ambient background ----------
   A WebGL radiance centred on the phone: layered fbm noise drifts slowly
   outward from the device, so the light reads as silk flowing off it —
   no edges, no geometry, just glow dissolving into the page. Rendered
   premultiplied over a transparent canvas, so the same shader works on
   both themes (mint wash on white, luminous green on black). Pauses when
   the hero is off-screen or the tab is hidden; renders a single static
   frame under reduced motion; survives context loss (mobile Safari
   evicts WebGL contexts under first-load memory pressure). If WebGL is
   unavailable the canvas's CSS gradient fallback simply stays. */
(function () {
  'use strict';

  var canvas = document.getElementById('hero-ambient');
  if (!canvas) return;

  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Per-fragment cost is what decides whether this holds 60fps on a phone,
     and the image is nothing but soft gradients — a slightly under-sampled
     buffer stretched back up is indistinguishable. Cap the device ratio, then
     cap total pixels as well, so a big desktop window and a dense phone
     screen both land inside the same fill-rate budget. The 0.6 floor lets a
     very large window overrun the budget rather than go mushy. `scale` is
     recomputed on every resize; it is the only px conversion this path uses. */
  var PIXEL_BUDGET = 1.15e6;
  var scale = 1;
  function measure() {
    var cw = Math.max(canvas.clientWidth, 1), ch = Math.max(canvas.clientHeight, 1);
    var s = Math.min(devicePixelRatio || 1, 1.75);
    var px = cw * ch * s * s;
    if (px > PIXEL_BUDGET) s *= Math.sqrt(PIXEL_BUDGET / px);
    scale = Math.max(s, 0.6);
  }
  measure();

  var VERT = [
    'attribute vec3 position;',
    'void main() { gl_Position = vec4(position, 1.0); }',
  ].join('\n');

  /* Everything is in phone-heights: p is the fragment's offset from the
     phone centre, 1.0 = one phone-height away. Two ray fields advect
     radially outward at different rates; each ray is born at the phone's
     silhouette and burns out as it travels. */
  var FRAG = [
    'precision highp float;',
    'uniform vec2 resolution;',
    'uniform vec4 flow;',       // the four advection phases, pre-wrapped in JS
    'uniform vec2 focus;',      // phone centre, device pixels, GL origin
    'uniform float span;',      // phone height, device pixels
    'uniform float ratio;',     // phone width / phone height
    'uniform vec3 tintIn;',
    'uniform vec3 tintOut;',
    'uniform float strength;',
    'uniform float reach;',     // gaussian falloff coefficient
    'uniform float base;',      // flat glow under the veils
    'uniform float veil;',      // how hard the noise texture reads
    'uniform float fill;',      // how much of the flat glow survives (see JS)
    '',
    // The noise is tileable on demand: hashing the wrapped lattice cell makes
    // the field exactly periodic, which buys two things. Angularly it closes
    // the circle with no seam and no sample-averaging (see below). Radially it
    // lets each advection phase be wrapped back to the start of a period once
    // per lap (see `flow` in JS) rather than counting up forever, so the hash
    // never sees the large coordinates where sin() loses its precision and the
    // texture degenerates into blotches on a tab that has been open all day.
    'float phash(vec2 p, vec2 per) {',
    '  p = mod(p, per);',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
    '}',
    'float pnoise(vec2 p, vec2 per) {',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(phash(i, per),                  phash(i + vec2(1.0, 0.0), per), u.x),',
    '             mix(phash(i + vec2(0.0, 1.0), per), phash(i + vec2(1.0, 1.0), per), u.x), u.y);',
    '}',
    // Octaves double the frequency, so the period doubles with them and every
    // octave stays in register. (Constant offsets are free — a shift by a whole
    // period still lands on the same wrapped cell.)
    'float pfbm(vec2 p, vec2 per) {',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  for (int i = 0; i < 3; i++) {',
    '    v += a * pnoise(p, per);',
    '    p = p * 2.0 + vec2(11.7, 5.3);',
    '    per *= 2.0;',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',
    '',
    'const float RPER = 16.0;',  // radial period of the ray fields, in noise units
    'const float CPER = 32.0;',  // and of the cloud, which drifts in both axes
    '',
    'void main() {',
    '  vec2 p = (gl_FragCoord.xy - focus) / span;',
    '  float r = length(p);',
    '  float ang = atan(p.y, p.x) * 0.1591549 + 0.5;',  // 0..1 around the phone
    '',
    '  // Rays of light streaming out of the phone, sampled in LOG-polar space.',
    '  // Plain polar makes rays that dissolve into blobs on their way out: the',
    '  // arc a noise cell covers grows with the radius while its radial length',
    '  // does not, so a wedge near the phone is a lump by the time it is two',
    '  // phone-heights away. Against log(r) both dimensions scale together, so',
    '  // a ray keeps its shape for its whole life and simply widens the way',
    '  // light actually does. Translating that axis is a multiply in world',
    '  // space, which is also why the rays visibly pick up speed as they go.',
    '  //',
    '  // Two fields at different angular frequencies, combined with max(): where',
    '  // one is between rays the other is usually mid-ray, so no sector of the',
    '  // circle can go bald while the pattern still reads as random. (The old',
    '  // single field blended two samples across the seam, which averaged the',
    '  // contrast away at exactly one angle — the phone\'s right-hand side —',
    '  // and left it permanently dim. Periodic noise has no seam to hide.)',
    '  float lr = log(max(r, 0.18));',
    '  // Cell aspect is what decides ray-versus-blob: an angular cell covers',
    '  // 2*PI/N radians, a radial one a factor exp(1/k) in radius, and the two',
    '  // want to sit around 6:1. N up / k down makes them finer and longer.',
    '  float fA = pfbm(vec2(ang * 30.0, lr * 1.15 - flow.x), vec2(30.0, RPER));',
    '  float fB = pfbm(vec2(ang * 19.0, lr * 0.95 - flow.y + 5.0), vec2(19.0, RPER));',
    '  float streak = pow(smoothstep(0.47, 0.80, max(fA, fB * 0.96)), 1.35);',
    '',
    '  // a soft slow cloud underneath keeps the rays from feeling clinical',
    '  float cl = smoothstep(0.34, 0.80, pnoise(p * 1.6 + flow.zw, vec2(CPER)));',
    '',
    '  // Because the field only translates outward, a ray\'s age IS its radius:',
    '  // one envelope in r therefore gives every ray the same life story. It',
    '  // clears the phone\'s silhouette (an ellipse on the real device aspect,',
    '  // so rays leave the sides and the ends alike), then dissipates well',
    '  // before the page edge instead of streaking off it.',
    '  float halo = exp(-r * r * reach);',
    '  // The ramp is deliberately short. Measured off the silhouette it looks',
    '  // generous, but the ellipse is narrow, so a wide ramp spends its whole',
    '  // length within a few dozen px of the phone\'s left and right edges —',
    '  // on a handset that is the entire margin, and the sides read as bald',
    '  // while the top and bottom blaze. Full strength by 1.3x clears it.',
    '  float born = smoothstep(0.96, 1.30, length(vec2(p.x / max(ratio * 0.5, 0.08), p.y * 2.0)));',
    '  float life = born * exp(-r * r * reach * 2.3);',
    '',
    '  // soft-knee instead of a hard clamp: dense noise phases compress',
    '  // toward the ceiling rather than saturating, so overall intensity',
    '  // stays level while the texture inside keeps moving',
    '  float x = (fill * (base + veil * 0.11 * cl) * halo + veil * streak * life) * strength;',
    '  float a = 1.0 - exp(-x * 1.35);',
    '  vec3 col = mix(tintIn, tintOut, clamp(r * 0.7, 0.0, 1.0));',
    '  gl_FragColor = vec4(col * a, a);', // premultiplied
    '}',
  ].join('\n');

  /* Same green, two voices: deeper tones carry on white, brighter ones
     glow on black. Values are 0-1 RGB for the shader. */
  function palette(theme) {
    var dark = theme === 'dark';
    return dark ? {
      tintIn: [0.4, 0.92, 0.64],    // luminous mint
      tintOut: [0.12, 0.56, 0.31],  // deep brand green
      strength: 1.0,
      reach: 0.6, base: 0.13, veil: 1.15,
    } : {
      /* On white the light must be darker than the page or it vanishes:
         deep brand greens, and almost no flat base so what reads is the ray
         texture rather than a uniform tint. The rays carry roughly twice the
         amplitude they do on black — a mid green at 40% over white is a much
         quieter mark than the same green at 40% over near-black. */
      tintIn: [0.07, 0.45, 0.24],   // deep brand green, darker than the page
      tintOut: [0.24, 0.63, 0.4],   // mid green, never pale mint
      strength: 1.15,
      reach: 0.62, base: 0.085, veil: 1.15,
    };
  }
  var pal = palette(document.documentElement.dataset.theme);
  new MutationObserver(function () {
    pal = palette(document.documentElement.dataset.theme);
    if (reduceMotion || rafId === null) draw(); // animated frames pick it up anyway
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* The light is anchored to the phone. Measure it every frame — two
     getBoundingClientRect calls are nothing, and it means fonts, layout
     shifts and breakpoint changes can never leave the glow misaligned. */
  var device = document.querySelector('.hero-device .device');
  function focusSpan() {
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!device) return { x: cw * 0.72 * scale, y: ch * 0.5 * scale, s: ch * 0.55 * scale, k: 0.46, f: 1 };
    var dr = device.getBoundingClientRect();
    var cr = canvas.getBoundingClientRect();
    var h = Math.max(dr.height, 1);
    return {
      x: (dr.left + dr.width / 2 - cr.left) * scale,
      // gl_FragCoord's origin is the bottom-left corner
      y: (cr.height - (dr.top + dr.height / 2 - cr.top)) * scale,
      s: h * scale,
      k: dr.width / h,
      // On a phone the device is most of the viewport's width, so the only
      // light with room to be seen is the near field — and there the flat
      // glow simply floods it, turning the rays into one soft wash. Stand the
      // fill down as the margin around the phone closes up; the rays are
      // untouched, so what little room there is goes to them.
      f: Math.min(1, Math.max(0.55, cr.width / 2 / h)),
    };
  }

  var gl = null;
  var uResolution, uFlow, uFocus, uSpan, uRatio, uTintIn, uTintOut, uStrength, uReach, uBase, uVeil, uFill;

  /* The four things that move: the two ray fields along their log-radius axis,
     and the cloud across x and y. Each is a phase that advances at its own
     rate and wraps at its field's period — the noise is exactly periodic there
     (see the shader), so the wrap is invisible, and no coordinate ever grows.
     Each starts somewhere random, so two visits never open on the same sky.

     A pure translation of a periodic field is also why there is no warm-up:
     every frame is as developed as every other, so the very first one already
     shows full-grown rays. There is nothing to fast-forward through. */
  var FLOW_RATE = [0.290, 0.210, 0.050, 0.037];
  var FLOW_WRAP = [16, 16, 32, 32];          // must match RPER / CPER
  var flowFrom = FLOW_WRAP.map(function (w) { return Math.random() * w; });
  var flow = flowFrom.slice();
  var flowT0 = performance.now();

  /* Each phase is a pure function of wall-clock time rather than a running sum
     of frame deltas, and that is what keeps the rays moving through a scroll.
     A touch or momentum scroll hands the page to the compositor and starves
     rAF — on a phone for a few hundred milliseconds at a time. Summing deltas
     had to clamp the step so a stalled tab could not jump the flow forward,
     and the clamp then ate the difference: 400ms of scrolling bought 50ms of
     travel, so the rays did not stutter, they lost ground, and the eye reads
     that as the light halting the moment you touch the screen. Computed from
     the clock, a starved frame costs a frame and nothing else — whenever the
     next one lands the rays are exactly where they always would have been, so
     there is no stall to see and no catch-up burst either. The modulo still
     holds every coordinate inside one period, so nothing grows however long
     the tab stays open. */
  function advance(now) {
    var t = (now - flowT0) / 1000;
    for (var i = 0; i < 4; i++) {
      flow[i] = (flowFrom[i] + FLOW_RATE[i] * t) % FLOW_WRAP[i];
    }
  }

  var rafId = null;
  var inView = true;

  function fail() {
    canvas.style.display = 'none'; // CSS gradient fallback takes over
  }

  /* Create the context and (re)build all GL state. Runs once at boot and
     again after webglcontextrestored, so nothing may leak between runs. */
  function initGL() {
    gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true })
      || canvas.getContext('experimental-webgl', { alpha: true });
    if (!gl || gl.isContextLost()) return false;

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }

    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;

    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);

    // Fullscreen quad (two triangles)
    var positions = new Float32Array([
      -1, -1, 0, 1, -1, 0, -1, 1, 0,
      1, -1, 0, -1, 1, 0, 1, 1, 0,
    ]);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    var posLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    uResolution = gl.getUniformLocation(program, 'resolution');
    uFlow = gl.getUniformLocation(program, 'flow');
    uFocus = gl.getUniformLocation(program, 'focus');
    uSpan = gl.getUniformLocation(program, 'span');
    uRatio = gl.getUniformLocation(program, 'ratio');
    uTintIn = gl.getUniformLocation(program, 'tintIn');
    uTintOut = gl.getUniformLocation(program, 'tintOut');
    uStrength = gl.getUniformLocation(program, 'strength');
    uReach = gl.getUniformLocation(program, 'reach');
    uBase = gl.getUniformLocation(program, 'base');
    uVeil = gl.getUniformLocation(program, 'veil');
    uFill = gl.getUniformLocation(program, 'fill');

    resize(true);
    return true;
  }

  function resize(force) {
    if (!gl) return;
    measure();
    var w = Math.max(1, Math.floor(canvas.clientWidth * scale));
    var h = Math.max(1, Math.floor(canvas.clientHeight * scale));
    if (force || canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2fv(uResolution, [w, h]);
    }
  }

  function draw() {
    if (!gl || gl.isContextLost()) return;
    advance(performance.now());
    var f = focusSpan();
    gl.uniform4fv(uFlow, flow);
    gl.uniform2fv(uFocus, [f.x, f.y]);
    gl.uniform1f(uSpan, f.s);
    gl.uniform1f(uRatio, f.k);
    gl.uniform3fv(uTintIn, pal.tintIn);
    gl.uniform3fv(uTintOut, pal.tintOut);
    gl.uniform1f(uStrength, pal.strength);
    gl.uniform1f(uReach, pal.reach);
    gl.uniform1f(uBase, pal.base);
    gl.uniform1f(uVeil, pal.veil);
    gl.uniform1f(uFill, f.f);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /* One rate, always. The rays are already developed on frame one, so there
     is nothing to fast-forward through — and an opening burst that eases back
     down is the one thing you can actually see in a field like this: it reads
     as the animation slowing to a halt rather than settling in. draw() reads
     the clock itself, so every path that paints — a resize, a theme swap, a
     restored context — lands on the right phase without threading time
     through, and time that passes while the hero is scrolled away or the tab
     is hidden simply passes. Nothing is watching it then. */
  function frame() {
    draw();
    rafId = requestAnimationFrame(frame);
  }
  function play() {
    if (rafId === null && !reduceMotion) rafId = requestAnimationFrame(frame);
  }
  function pause() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  if (!initGL()) { fail(); return; }
  canvas.style.background = 'none'; // shader owns the pixels; drop the CSS wash
  draw(); // always paint at least one frame

  /* Mobile Safari (and low-memory devices generally) may evict the context
     during a heavy first load. Recover instead of staying blank forever. */
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault(); // opt in to restoration
    pause();
  });
  canvas.addEventListener('webglcontextrestored', function () {
    if (initGL()) {
      draw();
      if (!reduceMotion && inView && !document.hidden) play();
    } else {
      fail();
    }
  });

  // Track the element itself, not just the window: fonts and the loader
  // handoff shift the hero's height after boot, which would leave a stale buffer.
  if ('ResizeObserver' in window) {
    new ResizeObserver(function () { resize(); draw(); }).observe(canvas);
  }
  addEventListener('resize', function () { resize(); draw(); });

  if (reduceMotion) return; // static veils, no motion

  // Save GPU/battery when the hero is scrolled away or the tab is hidden
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView && !document.hidden) play(); else pause();
    }, { threshold: 0 }).observe(canvas);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause(); else if (inView) play();
  });

  play();
})();
